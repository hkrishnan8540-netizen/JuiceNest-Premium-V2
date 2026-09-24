const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const sessions = new Map();
const loginAttempts = new Map();

const productSeed = [
  {id:'mango-glow', name:'Mango Glow', category:'Tropical', emoji:'🥭', price:69, discount:10, stock:45, featured:true, description:'Alphonso-style mango, chilled and silky.', calories:180, ingredients:['Mango','Water','Lime']},
  {id:'orange-rush', name:'Orange Rush', category:'Citrus', emoji:'🍊', price:59, discount:0, stock:60, featured:true, description:'Bright citrus blend with a clean finish.', calories:120, ingredients:['Orange','Lime']},
  {id:'watermelon-wave', name:'Watermelon Wave', category:'Fresh', emoji:'🍉', price:55, discount:5, stock:38, featured:true, description:'Hydrating watermelon with mint lift.', calories:95, ingredients:['Watermelon','Mint','Lime']},
  {id:'berry-bloom', name:'Berry Bloom', category:'Premium', emoji:'🫐', price:89, discount:0, stock:28, featured:true, description:'Berry-rich blend with a creamy body.', calories:170, ingredients:['Blueberry','Strawberry','Milk']},
  {id:'pineapple-pop', name:'Pineapple Pop', category:'Tropical', emoji:'🍍', price:65, discount:0, stock:34, featured:false, description:'Sweet pineapple with ginger sparkle.', calories:130, ingredients:['Pineapple','Ginger','Lime']},
  {id:'green-boost', name:'Green Boost', category:'Healthy', emoji:'🥝', price:79, discount:8, stock:24, featured:true, description:'Kiwi, cucumber and greens for a crisp sip.', calories:110, ingredients:['Kiwi','Cucumber','Spinach','Lime']},
  {id:'banana-cloud', name:'Banana Cloud', category:'Shake', emoji:'🍌', price:75, discount:0, stock:36, featured:false, description:'Banana milk shake with a soft vanilla note.', calories:240, ingredients:['Banana','Milk','Vanilla']},
  {id:'pomegranate-pulse', name:'Pomegranate Pulse', category:'Premium', emoji:'❤️', price:95, discount:12, stock:22, featured:true, description:'Deep pomegranate flavour, freshly blended.', calories:145, ingredients:['Pomegranate','Lime']}
];

function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')) {
  return {salt, hash: crypto.scryptSync(password, salt, 64).toString('hex')};
}
function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;
  const a = Buffer.from(user.passwordHash, 'hex');
  const b = crypto.scryptSync(password, user.salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
function seedUser(username, password, name, role) {
  const p=hashPassword(password); return {id:crypto.randomUUID(), username, name, role, active:true, salt:p.salt, passwordHash:p.hash, createdAt:new Date().toISOString()};
}
function defaultDb(){
  return {
    products: productSeed,
    orders: [],
    users: [
      seedUser('admin','Admin@123','JuiceNest Admin','ADMIN'),
      seedUser('delivery1','Delivery@123','Arun Delivery','DELIVERY'),
      seedUser('kitchen1','Kitchen@123','Kitchen Desk','KITCHEN')
    ],
    offers:[{id:'lunch10', code:'LUNCH10', label:'Lunch break special', percent:10, active:true}],
    audit:[]
  };
}
function ensureDb(){
  fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
  if(!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH,JSON.stringify(defaultDb(),null,2));
}
function readDb(){ ensureDb(); return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); }
function writeDb(db){ fs.writeFileSync(DB_PATH,JSON.stringify(db,null,2)); }
function audit(db, actor, action, detail=''){ db.audit.unshift({at:new Date().toISOString(), actor, action, detail}); db.audit=db.audit.slice(0,500); }

function parseCookies(req){
  const out={}; (req.headers.cookie||'').split(';').forEach(x=>{const i=x.indexOf('='); if(i>0) out[x.slice(0,i).trim()]=decodeURIComponent(x.slice(i+1));}); return out;
}
function getSession(req){
  const token=parseCookies(req).jn_session; if(!token) return null;
  const s=sessions.get(token); if(!s || s.expires < Date.now()){ if(token) sessions.delete(token); return null; }
  s.expires=Date.now()+8*60*60*1000; return s;
}
function requireRole(req,res,roles){ const s=getSession(req); if(!s || !roles.includes(s.role)){ json(res,403,{error:'Access denied'}); return null; } return s; }
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function bad(res,msg='Bad request'){json(res,400,{error:msg});}
async function body(req){return await new Promise((resolve,reject)=>{let d=''; req.on('data',c=>{d+=c;if(d.length>1e6){reject(new Error('Too large'));req.destroy();}});req.on('end',()=>{try{resolve(d?JSON.parse(d):{});}catch(e){reject(e);}});});}
function sanitizeUser(u){return {id:u.id,username:u.username,name:u.name,role:u.role,active:u.active,createdAt:u.createdAt};}
function finalPrice(p){return Math.round(p.price*(1-(p.discount||0)/100));}
function publicOrder(o){return {...o};}
function idOrder(){return 'JN'+Date.now().toString().slice(-7)+Math.floor(10+Math.random()*90);}
function mime(file){const e=path.extname(file).toLowerCase();return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[e]||'application/octet-stream');}
function serveFile(res,file){
  if(!fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':file.endsWith('.html')?'no-store':'public, max-age=3600'}); fs.createReadStream(file).pipe(res);
}
function safePublic(urlPath){const rel=decodeURIComponent(urlPath).replace(/^\/+/, ''); const f=path.normalize(path.join(PUBLIC,rel)); return f.startsWith(PUBLIC)?f:null;}

async function api(req,res,url){
  const db=readDb();
  if(req.method==='POST' && url.pathname==='/api/login'){
    const ip=req.socket.remoteAddress||'local'; const attempts=loginAttempts.get(ip)||{count:0,until:0};
    if(attempts.until>Date.now()) return json(res,429,{error:'Too many attempts. Try again shortly.'});
    const b=await body(req); const u=db.users.find(x=>x.username.toLowerCase()===String(b.username||'').toLowerCase());
    if(!u || !u.active || !verifyPassword(String(b.password||''),u)){
      attempts.count++; if(attempts.count>=5){attempts.count=0;attempts.until=Date.now()+60_000;} loginAttempts.set(ip,attempts); return json(res,401,{error:'Invalid username or password'});
    }
    loginAttempts.delete(ip); const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{userId:u.id,username:u.username,name:u.name,role:u.role,expires:Date.now()+8*60*60*1000});
    audit(db,u.username,'LOGIN'); writeDb(db);
    return json(res,200,{user:sanitizeUser(u)},{'Set-Cookie':`jn_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`});
  }
  if(req.method==='POST' && url.pathname==='/api/logout'){
    const token=parseCookies(req).jn_session; if(token) sessions.delete(token); return json(res,200,{ok:true},{'Set-Cookie':'jn_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
  }
  if(req.method==='GET' && url.pathname==='/api/me'){
    const s=getSession(req); return json(res,200,{user:s?{username:s.username,name:s.name,role:s.role}:null});
  }
  if(req.method==='GET' && url.pathname==='/api/products') return json(res,200,{products:db.products.filter(p=>p.active!==false)});

  if(req.method==='POST' && url.pathname==='/api/orders'){
    const b=await body(req);
    const customerType=String(b.customerType||'STUDENT').toUpperCase()==='TEACHER'?'TEACHER':'STUDENT';
    const required=['name','className','classNumber','block','timeSlot','paymentMethod'];
    for(const k of required) if(!String(b[k]||'').trim()) return bad(res,`Missing ${k}`);
    if(customerType==='STUDENT'&&!String(b.rollNumber||'').trim()) return bad(res,'Missing rollNumber');
    if(!Array.isArray(b.items)||!b.items.length) return bad(res,'Cart is empty');
    let total=0; const items=[];
    for(const it of b.items){
      const p=db.products.find(x=>x.id===it.productId && x.active!==false); if(!p) return bad(res,'Product unavailable');
      const qty=Math.max(1,Math.min(10,Number(it.qty)||1)); if(p.stock<qty) return bad(res,`${p.name} has only ${p.stock} left`);
      let unit=finalPrice(p); const size=['Regular','Large','Jumbo'].includes(it.size)?it.size:'Regular'; if(size==='Large') unit+=20; if(size==='Jumbo') unit+=35;
      const addons=Array.isArray(it.addons)?it.addons.filter(x=>['Chia seeds','Mint boost','Protein scoop'].includes(x)):[]; unit += addons.includes('Chia seeds')?10:0; unit += addons.includes('Mint boost')?5:0; unit += addons.includes('Protein scoop')?25:0;
      total+=unit*qty; items.push({productId:p.id,name:p.name,emoji:p.emoji,qty,unitPrice:unit,size,sugar:it.sugar||'Normal',ice:it.ice||'Regular',addons});
    }
    const code=String(Math.floor(1000+Math.random()*9000));
    const order={id:idOrder(),createdAt:new Date().toISOString(),customerType,name:String(b.name).trim().slice(0,80),rollNumber:customerType==='STUDENT'?String(b.rollNumber||'').trim().slice(0,40):'',className:String(b.className).trim().slice(0,80),classNumber:String(b.classNumber).trim().slice(0,30),block:String(b.block).trim().slice(0,40),timeSlot:String(b.timeSlot).slice(0,40),paymentMethod:String(b.paymentMethod).slice(0,30),paymentStatus:b.paymentMethod==='UPI'?'PENDING':'PAY_ON_DELIVERY',note:String(b.note||'').trim().slice(0,250),items,total,status:'PLACED',assignedTo:null,pickupCode:code,rewardPoints:Math.floor(total/10),history:[{status:'PLACED',at:new Date().toISOString(),by:'customer'}]};
    for(const it of items){const p=db.products.find(x=>x.id===it.productId); p.stock-=it.qty;}
    db.orders.unshift(order); audit(db,order.customerType==='STUDENT'?order.rollNumber:`TEACHER:${order.name}`,'ORDER_CREATED',order.id); writeDb(db); return json(res,201,{order:publicOrder(order)});
  }
  if(req.method==='GET' && url.pathname==='/api/orders/track'){
    const id=(url.searchParams.get('id')||'').trim(); const roll=(url.searchParams.get('rollNumber')||'').trim().toLowerCase();
    const orders=db.orders.filter(o=>(id&&o.id.toLowerCase()===id.toLowerCase()) || (roll&&o.customerType!=='TEACHER'&&String(o.rollNumber||'').toLowerCase()===roll)).slice(0,10); return json(res,200,{orders:orders.map(publicOrder)});
  }

  if(url.pathname.startsWith('/api/admin/')){
    const s=requireRole(req,res,['ADMIN']); if(!s) return;
    if(req.method==='GET' && url.pathname==='/api/admin/dashboard'){
      const today=new Date().toISOString().slice(0,10); const todays=db.orders.filter(o=>o.createdAt.slice(0,10)===today); const revenue=todays.filter(o=>o.status==='DELIVERED').reduce((a,o)=>a+o.total,0);
      const pending=db.orders.filter(o=>!['DELIVERED','CANCELLED'].includes(o.status)).length; const lowStock=db.products.filter(p=>p.stock<=10).length;
      const blocks={}; db.orders.filter(o=>!['DELIVERED','CANCELLED'].includes(o.status)).forEach(o=>blocks[o.block]=(blocks[o.block]||0)+1);
      return json(res,200,{stats:{todayOrders:todays.length,revenue,pending,lowStock},blocks,audit:db.audit.slice(0,12)});
    }
    if(req.method==='GET' && url.pathname==='/api/admin/orders') return json(res,200,{orders:db.orders,deliveryUsers:db.users.filter(u=>u.role==='DELIVERY'&&u.active).map(sanitizeUser)});
    const om=url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if(om && req.method==='PATCH'){
      const b=await body(req); const o=db.orders.find(x=>x.id===om[1]); if(!o) return json(res,404,{error:'Order not found'});
      if(b.assignedTo!==undefined){const u=db.users.find(x=>x.id===b.assignedTo&&x.role==='DELIVERY'&&x.active); if(b.assignedTo && !u) return bad(res,'Invalid delivery partner'); o.assignedTo=b.assignedTo||null;}
      if(b.status){const allowed=['PLACED','ACCEPTED','PREPARING','READY','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED']; if(!allowed.includes(b.status))return bad(res,'Invalid status'); o.status=b.status;o.history.push({status:b.status,at:new Date().toISOString(),by:s.username});}
      audit(db,s.username,'ORDER_UPDATED',o.id); writeDb(db); return json(res,200,{order:o});
    }
    if(req.method==='GET' && url.pathname==='/api/admin/products') return json(res,200,{products:db.products});
    if(req.method==='POST' && url.pathname==='/api/admin/products'){
      const b=await body(req); if(!b.name||!Number.isFinite(Number(b.price))) return bad(res,'Name and price required');
      const p={id:String(b.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Math.floor(Math.random()*1000),name:String(b.name).slice(0,80),category:String(b.category||'Fresh').slice(0,40),emoji:String(b.emoji||'🥤').slice(0,4),price:Number(b.price),discount:Math.max(0,Math.min(80,Number(b.discount)||0)),stock:Math.max(0,Number(b.stock)||0),featured:!!b.featured,description:String(b.description||'Freshly prepared.').slice(0,180),calories:Number(b.calories)||0,ingredients:String(b.ingredients||'').split(',').map(x=>x.trim()).filter(Boolean),active:true};
      db.products.push(p);audit(db,s.username,'PRODUCT_CREATED',p.id);writeDb(db);return json(res,201,{product:p});
    }
    const pm=url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if(pm && req.method==='PATCH'){
      const p=db.products.find(x=>x.id===pm[1]); if(!p)return json(res,404,{error:'Product not found'});const b=await body(req);
      for(const k of ['name','category','emoji','description']) if(b[k]!==undefined)p[k]=String(b[k]); for(const k of ['price','discount','stock','calories']) if(b[k]!==undefined)p[k]=Math.max(0,Number(b[k])||0); if(b.active!==undefined)p.active=!!b.active;if(b.featured!==undefined)p.featured=!!b.featured;
      audit(db,s.username,'PRODUCT_UPDATED',p.id);writeDb(db);return json(res,200,{product:p});
    }
    if(req.method==='GET' && url.pathname==='/api/admin/users') return json(res,200,{users:db.users.filter(u=>u.role!=='ADMIN').map(sanitizeUser)});
    if(req.method==='POST' && url.pathname==='/api/admin/users'){
      const b=await body(req); const role=['DELIVERY','KITCHEN'].includes(b.role)?b.role:null; if(!role||!b.username||!b.password||String(b.password).length<8)return bad(res,'Role, username and password (8+ chars) required'); if(db.users.some(u=>u.username.toLowerCase()===String(b.username).toLowerCase()))return bad(res,'Username already exists');
      const p=hashPassword(String(b.password)); const u={id:crypto.randomUUID(),username:String(b.username).trim(),name:String(b.name||b.username).trim(),role,active:true,salt:p.salt,passwordHash:p.hash,createdAt:new Date().toISOString()};db.users.push(u);audit(db,s.username,'USER_CREATED',u.username);writeDb(db);return json(res,201,{user:sanitizeUser(u)});
    }
    const um=url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(um && req.method==='PATCH') {const u=db.users.find(x=>x.id===um[1]&&x.role!=='ADMIN');if(!u)return json(res,404,{error:'User not found'});const b=await body(req);if(b.active!==undefined)u.active=!!b.active;audit(db,s.username,'USER_UPDATED',u.username);writeDb(db);return json(res,200,{user:sanitizeUser(u)});}
  }

  if(url.pathname.startsWith('/api/kitchen/')){
    const s=requireRole(req,res,['KITCHEN','ADMIN']); if(!s)return;
    if(req.method==='GET' && url.pathname==='/api/kitchen/orders') return json(res,200,{orders:db.orders.filter(o=>['PLACED','ACCEPTED','PREPARING','READY'].includes(o.status))});
    const m=url.pathname.match(/^\/api\/kitchen\/orders\/([^/]+)$/); if(m&&req.method==='PATCH'){const b=await body(req);const o=db.orders.find(x=>x.id===m[1]);if(!o)return json(res,404,{error:'Not found'});if(!['ACCEPTED','PREPARING','READY'].includes(b.status))return bad(res,'Invalid kitchen status');o.status=b.status;o.history.push({status:b.status,at:new Date().toISOString(),by:s.username});audit(db,s.username,'KITCHEN_STATUS',`${o.id}:${b.status}`);writeDb(db);return json(res,200,{order:o});}
  }

  if(url.pathname.startsWith('/api/delivery/')){
    const s=requireRole(req,res,['DELIVERY']); if(!s)return;
    const user=db.users.find(u=>u.id===s.userId); if(!user||!user.active)return json(res,403,{error:'Account disabled'});
    if(req.method==='GET' && url.pathname==='/api/delivery/orders') return json(res,200,{orders:db.orders.filter(o=>o.assignedTo===s.userId&&!['DELIVERED','CANCELLED'].includes(o.status))});
    const m=url.pathname.match(/^\/api\/delivery\/orders\/([^/]+)$/); if(m&&req.method==='PATCH'){
      const b=await body(req);const o=db.orders.find(x=>x.id===m[1]&&x.assignedTo===s.userId);if(!o)return json(res,404,{error:'Assigned order not found'}); const allowed=['PICKED_UP','OUT_FOR_DELIVERY','DELIVERED'];if(!allowed.includes(b.status))return bad(res,'Invalid delivery status');if(b.status==='DELIVERED'&&String(b.code)!==String(o.pickupCode))return bad(res,'Verification code does not match'); if(b.status==='DELIVERED')o.paymentStatus='PAID_OR_COLLECTED';o.status=b.status;o.history.push({status:b.status,at:new Date().toISOString(),by:s.username});audit(db,s.username,'DELIVERY_STATUS',`${o.id}:${b.status}`);writeDb(db);return json(res,200,{order:o});
    }
  }
  return json(res,404,{error:'API not found'});
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);
    if(url.pathname==='/admin' || url.pathname==='/admin.html'){const s=getSession(req); if(!s||s.role!=='ADMIN'){res.writeHead(302,{Location:'/login.html?next=admin'});return res.end();} return serveFile(res,path.join(PUBLIC,'admin.html'));}
    if(url.pathname==='/delivery' || url.pathname==='/delivery.html'){const s=getSession(req); if(!s||s.role!=='DELIVERY'){res.writeHead(302,{Location:'/login.html?next=delivery'});return res.end();} return serveFile(res,path.join(PUBLIC,'delivery.html'));}
    if(url.pathname==='/kitchen' || url.pathname==='/kitchen.html'){const s=getSession(req); if(!s||!['KITCHEN','ADMIN'].includes(s.role)){res.writeHead(302,{Location:'/login.html?next=kitchen'});return res.end();} return serveFile(res,path.join(PUBLIC,'kitchen.html'));}
    if(url.pathname==='/') return serveFile(res,path.join(PUBLIC,'index.html'));
    const file=safePublic(url.pathname); if(!file){res.writeHead(403);return res.end('Forbidden');} return serveFile(res,file);
  }catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'Server error'});else res.end();}
});
ensureDb();
server.listen(PORT,()=>console.log(`JuiceNest running at http://localhost:${PORT}`));
