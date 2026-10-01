(function(){
  'use strict';
  function initSlider(root){
    const track=root.querySelector('.nesma-slider-addon__track');
    const slides=root.querySelectorAll('.nesma-slider-addon__slide');
    const dots=root.querySelector('.nesma-slider-addon__dots');
    if(!track||!slides.length||!dots)return;
    let current=0, timer;
    slides.forEach(function(_,i){
      const dot=document.createElement('button');
      dot.type='button'; dot.className='nesma-slider-addon__dot'+(i===0?' is-active':'');
      dot.setAttribute('aria-label','الانتقال إلى الصورة '+(i+1));
      dot.addEventListener('click',function(){goTo(i);start();});
      dots.appendChild(dot);
    });
    const dotEls=dots.querySelectorAll('.nesma-slider-addon__dot');
    function goTo(index){
      current=(index+slides.length)%slides.length;
      track.style.transform='translateX(-'+(current*100)+'%)';
      dotEls.forEach(function(d){d.classList.remove('is-active')});
      dotEls[current].classList.add('is-active');
    }
    function change(direction){goTo(current+direction);start();}
    function start(){clearInterval(timer);timer=setInterval(function(){goTo(current+1)},4000)}
    root.querySelector('.nesma-slider-addon__prev').addEventListener('click',function(){change(-1)});
    root.querySelector('.nesma-slider-addon__next').addEventListener('click',function(){change(1)});
    root.addEventListener('mouseenter',function(){clearInterval(timer)});
    root.addEventListener('mouseleave',start);
    root.addEventListener('touchstart',function(){clearInterval(timer)},{passive:true});
    root.addEventListener('touchend',start,{passive:true});
    start();
  }
  document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.nesma-slider-addon').forEach(initSlider)});
})();
