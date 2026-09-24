window.JN={
  async api(url,options={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Something went wrong');return d;},
  money(n){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)},
  toast(msg,type='ok'){let box=document.querySelector('.toast-stack');if(!box){box=document.createElement('div');box.className='toast-stack';document.body.appendChild(box)}const el=document.createElement('div');el.className='toast '+type;el.textContent=msg;box.appendChild(el);setTimeout(()=>el.remove(),3200)},
  esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))},
  statusLabel(s){return ({PLACED:'Order placed',ACCEPTED:'Accepted',PREPARING:'Preparing',READY:'Ready',PICKED_UP:'Picked up',OUT_FOR_DELIVERY:'Out for delivery',DELIVERED:'Delivered',CANCELLED:'Cancelled'}[s]||s)},
  initTheme(){const saved=localStorage.getItem('jn-theme')||'light';document.documentElement.dataset.theme=saved;document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.onclick=()=>{const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('jn-theme',n);});},
  async logout(){try{await this.api('/api/logout',{method:'POST'})}finally{location.href='/login.html'}}
};
document.addEventListener('DOMContentLoaded',()=>JN.initTheme());
