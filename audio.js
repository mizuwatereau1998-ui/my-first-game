// 音専用のモジュール。無音・API非対応・自動再生拒否でもゲームを止めない。
(() => {
  const KEY = 'word-pop-sound-v1';
  const controls = { bgm:document.getElementById('bgm-toggle'), sfx:document.getElementById('sfx-toggle') };
  let settings = {bgm:true,sfx:true};
  try { const saved=JSON.parse(localStorage.getItem(KEY)); if(saved) settings={bgm:saved.bgm===true,sfx:saved.sfx===true}; } catch {}
  let context=null, bgmGain=null, sfxGain=null, activated=false, musicTimer=null, nextBeat=0, step=0, fileSource=null, player=null, leaving=false;
  const voices=new Set(), lastPlayed=new Map();
  const supported=!!(window.AudioContext||window.webkitAudioContext);
  const visible=()=>!document.hidden&&!leaving;
  const status=text=>{document.getElementById('audio-status').textContent=text;};
  function ensureContext() {
    if(context) return true;
    try {
      const C=window.AudioContext||window.webkitAudioContext;
      if(!C)return false;
      context=new C();bgmGain=context.createGain();sfxGain=context.createGain();
      bgmGain.gain.value=.22;sfxGain.gain.value=.24;
      bgmGain.connect(context.destination);sfxGain.connect(context.destination);return true;
    } catch {status('この環境では音を再生できません。ゲームはそのまま遊べます。');return false;}
  }
  function tone(frequency,time,duration,amplitude,kind,group) {
    if(!context || voices.size>=28)return;
    try {
      const oscillator=context.createOscillator(), gain=context.createGain();
      oscillator.type=kind;oscillator.frequency.setValueAtTime(frequency,time);
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(amplitude,time+.009);
      gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
      oscillator.connect(gain);gain.connect(group==='bgm'?bgmGain:sfxGain);
      const voice={oscillator,gain,group};voices.add(voice);
      oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};
      oscillator.start(time);oscillator.stop(time+duration+.01);
    } catch {}
  }
  function stopVoices(group) {for(const voice of voices)if(!group||voice.group===group){try{voice.oscillator.stop();}catch{} voices.delete(voice);}}
  function stopMusic() {clearInterval(musicTimer);musicTimer=null;stopVoices('bgm');if(player)player.pause();}
  const melody=[72,76,79,0,76,74,72,0,69,72,76,0,74,0,67,0,65,69,72,0,71,69,67,0,67,71,74,0,76,74,72,0];
  const frequency=midi=>440*2**((midi-69)/12);
  function startMusic() {
    if(!settings.bgm||!activated||!visible()||!context||context.state!=='running')return;
    if(fileSource){
      if(!player){player=new Audio(fileSource);player.loop=true;player.volume=.12;player.onerror=()=>status('BGMを読み込めません。効果音とゲームは引き続き使えます。');}
      if(player.paused)player.play().catch(()=>status('BGMを再生できません。音の設定を入れ直してください。'));
      return;
    }
    if(musicTimer!==null)return;
    nextBeat=context.currentTime+.03;step=0;
    function schedule(){
      if(!visible()||!settings.bgm){stopMusic();return;}
      while(nextBeat<context.currentTime+.3){
        const note=melody[step%melody.length];
        if(note)tone(frequency(note),nextBeat,.23,.035,'sine','bgm');
        if(step%4===0)tone(frequency([48,45,53,55][Math.floor(step/8)%4]),nextBeat,.38,.04,'triangle','bgm');
        step++;nextBeat+=.27;
      }
    }
    schedule();musicTimer=setInterval(schedule,120);
  }
  function unlock() {
    if(!supported||!visible()||(!settings.bgm&&!settings.sfx))return;
    activated=true;if(!ensureContext())return;
    try{Promise.resolve(context.resume()).then(startMusic).catch(()=>status('音の再生が制限されています。音の設定からもう一度お試しください。'));}catch{}
  }
  function sfx(name) {
    if(!settings.sfx||!activated||!visible()||!context||context.state!=='running')return;
    const now=context.currentTime,limit=name==='select'?.055:name==='fall'?.12:.09;
    if(now-(lastPlayed.get(name)??-100)<limit)return;
    lastPlayed.set(name,now);
    const notes={select:[950],button:[460],correct:[523,659,1047],chain2:[659,784,1047,1319],chain3:[523,659,784,1047,1319],fall:[210,165]}[name];
    if(!notes)return;
    notes.forEach((note,n)=>tone(note,now+n*(name==='fall'?.045:.075),name==='select'?.065:name==='fall'?.07:.23,name==='select'?.09:name==='fall'?.07:.12,name==='fall'?'triangle':'sine','sfx'));
  }
  for(const [name,input]of Object.entries(controls)){
    input.checked=settings[name];input.disabled=!supported;
    input.addEventListener('change',()=>{
      settings[name]=input.checked;
      try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{status('このブラウザでは設定を保存できません。今回のプレイ中は有効です。');}
      if(name==='bgm'&&!settings.bgm)stopMusic();
      if(name==='sfx'&&!settings.sfx)stopVoices('sfx');
      unlock();
    });
  }
  if(!supported)status('この環境は音声生成に非対応です。ゲームはそのまま遊べます。');
  document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('click',event=>{if(event.target.closest('button'))sfx('button');});
  document.addEventListener('visibilitychange',()=>{if(!visible()){stopMusic();stopVoices('sfx');}else if(activated)unlock();});
  window.addEventListener('pagehide',()=>{leaving=true;stopMusic();stopVoices('sfx');});
  window.addEventListener('pageshow',()=>{leaving=false;if(activated)unlock();});
  globalThis.WordPopAudio={sfx,setBgmSource(url){stopMusic();if(player){player.removeAttribute('src');player.load();player=null;}fileSource=url||null;startMusic();}};
})();
