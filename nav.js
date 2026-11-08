/* shared shell: sidebar (desktop) + bottom bar (mobile). Each page sets <body data-page="..."> and puts its content in #pg */
(function(){
var P=[['index.html','🏠','Home','home'],['games.html','🎮','Games','games'],['shop.html','🛒','Shop','shop'],['rewards.html','🎁','Rewards','rewards'],['profile.html','👤','Profile','profile']];
function init(){var pg=document.getElementById('pg');if(!pg)return;var cur=document.body.dataset.page,w=document.createElement('div');w.className='v17';
w.innerHTML='<aside class="side"><div class="brand"><img src="ari-game-zone-icon.svg" alt="Ari Game Zone logo"><span>ARI<br>GAME ZONE</span></div>'+P.map(function(p){return '<a href="'+p[0]+'"'+(p[3]===cur?' class="on"':'')+'>'+p[1]+' '+p[2]+'</a>'}).join('')+'<button type="button" disabled style="opacity:.5">🏆 Leaderboard · soon</button><button type="button" disabled style="opacity:.5">👥 Friends · soon</button></aside><div class="content"></div>';
pg.parentNode.insertBefore(w,pg);w.querySelector('.content').appendChild(pg);
var n=document.createElement('nav');n.className='bnav';n.innerHTML=P.map(function(p,i){return '<a href="'+p[0]+'"'+(i===2?'':'')+' style="'+(p[3]===cur?'color:#fff':'')+'">'+p[1]+'<span>'+p[2]+'</span></a>'}).join('');document.body.appendChild(n)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
