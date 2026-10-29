'use strict';

//スクロール防止
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });


//Speed処理定義
const speed_square = document.querySelector('.speed_square');
const speed_stick = document.querySelector('.speed_stick');
const speed = document.querySelector('.speed');
const speed_mater = document.querySelector('.speed_mater');
var moter_speed = 0;
let speed_flag = false;

//時間処理定義
var time = document.querySelector('.time');
var now_time = new Date();

//ギア処理定義
const giar = document.querySelectorAll('.giars, .giar_line');
const giar_stick = document.querySelector('.giar_stick');
var giar_flag = false;
const gtR = document.querySelector('.gtR');
const gt1 = document.querySelector('.gt1');
const gt2 = document.querySelector('.gt2');
const gt3 = document.querySelector('.gt3');
const gt4 = document.querySelector('.gt4');
const gt5 = document.querySelector('.gt5');
const giar_selectors = [gtR,gt1,gt2,gt3,gt4,gt5];
var moter_giar = 6;		//6はN状態、0はR状態、他は数字通り(起動時はN)


//角度処理定義
const radius = document.querySelector('.radius');
const radius_boundary = document.querySelector('.radius_boundary');
const stickgroove_radius = document.querySelector('.stickgroove_radius');
var radius_flag = false;
var moter_degree = 0;

//wifi処理定義
var wifi = document.querySelector('.wifi');

//bluetooth・バッテリー・ナンバー処理定義
var bluetooth = document.querySelector('.bluetooth');
var battery = document.querySelector('.battery');
var number = document.querySelector('.number');

//通信処理定義
const MY_ID = Number(new URLSearchParams(location.search).get('id'));		//URLの ?id=1~3 がPico番号
const WS_URL = 'ws://' + location.hostname + ':8765/?id=' + MY_ID;
const SEND_INTERVAL_MS = 100;		//送信間隔(Python側は1秒届かないと停止指令にする)
var ws = null;

Wifi_Config();









//Speed処理







//speedのアップデート
const Up_Down_Speed=(event) =>{
	const y = event.offsetY
	speed_stick.style.top = y+'px';
	speed.style.height = (400-y)+'px';
	speed_mater.textContent = "Speed:"+ Math.round( (400-y)/4 ) +"%";
	moter_speed = Math.round( (400-y)/4) ;
}

//Speedの処理
speed_square.addEventListener('pointerdown',(event) => {
	speed_flag = true;
	Up_Down_Speed(event);
	});
speed_square.addEventListener('pointermove',(event) => {
	if(speed_flag == true){ Up_Down_Speed(event); }
	if (speed_square.hasPointerCapture(event.pointerId)) { speed_square.releasePointerCapture(event.pointerId); }
	});
window.addEventListener('pointerup', () => { speed_flag=false; } )



//角度処理


//角度アップデート
const Update_Radius=(event) =>{
	var x = - Math.round( (300-event.offsetX) / 10 );
	var y = Math.round( (300-event.offsetY) / 10 );
	var r = Math.sqrt(Math.abs(x)**2+Math.abs(y)**2);
	if(r === 0){ return; }		//中心ちょうどだと0で割ってNaNになるため
	var sin = y/r;
	var cos = x/r;
	
	stickgroove_radius.style.transform = 'rotate(' + Math.asin(cos) + 'rad)';
	radius.textContent = 'radius '+ Math.round( Math.asin(cos)*180/Math.PI ) + 'deg';
	moter_degree = Math.round( Math.asin(cos)*180/Math.PI );
}

//角度の処理
radius_boundary.addEventListener('pointerdown',(event) => {
	radius_flag = true;
	 Update_Radius(event);
	});
radius_boundary.addEventListener('pointermove',(event) => {
	if(radius_flag == true){ Update_Radius(event); }
	if (radius_boundary.hasPointerCapture(event.pointerId)) { radius_boundary.releasePointerCapture(event.pointerId); }
	} );
window.addEventListener('pointerup', () => { radius_flag = false; } )







//ギア処理

const Giar_UpDate=(event) =>{
	const x = event.clientX
	const y = event.clientY;
	giar_stick.style.position = 'fixed';
	giar_stick.style.top = (y - 45) + 'px';
	giar_stick.style.left = (x - 45) + 'px';
}

const Giar_Select=(event) =>{
	const R = 45;
	const s = giar_stick.getBoundingClientRect();
	const sx = s.left + R , sy = s.top + R;   // 円の中心

	var best = 0,mindiff = Infinity;
	var x = 0,y = 0,r = 0,rect = 0;
	var top = 0,bottom = 0;


	//6はN常態で0はR状態、他は数字通り	
	for(var i=0;i<7;i++){	

		if(i == 6){
			bottom = giar_selectors[0].getBoundingClientRect();
			top = giar_selectors[1].getBoundingClientRect();
			x = top.left + top.width / 2;
			y = (top.top + top.height) + (bottom.top + bottom.height)/4;
			r = Math.sqrt( ( (sx-x)**2+(sy-y)**2 ) );
		}else{
			rect = giar_selectors[i].getBoundingClientRect();
			x = rect.left + rect.width / 2;
			y = rect.top + rect.height / 2;
			r = Math.sqrt( ( (sx-x)**2+(sy-y)**2 ) );
		}
		
		if(r < mindiff){
			mindiff = r;
			best = i;
		}
		
	}
	


	moter_giar = best; 
}

giar.forEach((part) => {
	part.addEventListener('pointerdown',(event) => {
		giar_flag = true;
		Giar_UpDate(event);
	});
	
	part.addEventListener('pointermove',(event) =>{
		if (part.hasPointerCapture(event.pointerId)) { part.releasePointerCapture(event.pointerId); }
		if(giar_flag){ Giar_UpDate(event);} 
	});
	
});


window.addEventListener('pointerup', (event) => { 
	if(giar_flag == true){
		giar_flag=false;
		Giar_Select(event);
	}
	
} )








//時間

function Zero_Plus(num){
	var i = 0;
	if(num < 10){ i =  "0" +num; }
	else{ i = num; }
	return i;
}

function Update_Time(){
	now_time = new Date();
	var hour = Zero_Plus( now_time.getHours() );
	var minutes = Zero_Plus( now_time.getMinutes() );
	var seconds = Zero_Plus( now_time.getSeconds() );
	time.innerHTML = "Time <br> " + hour + ":" + minutes + ":" + seconds;
}

setInterval(Update_Time, 1000);




//wifi処理
//Pi(WebSocket)につながっているかで表示する
function Wifi_Config(){
	if (ws !== null && ws.readyState === WebSocket.OPEN){ wifi.innerHTML = "Wifi<br>Connection Success!!";} 
	else { wifi.innerHTML = "Wifi<br>No Connection";}
}





//ナンバー処理
//URLの ?id= の番号を表示する
function Update_Number(){
	if(MY_ID >= 1 && MY_ID <= 3){ number.textContent = "Number:" + MY_ID; }
	else{ number.textContent = "Number:None (URLに ?id=1~3 を付けて)"; }
}




//bluetooth処理
//Picoの状態({id, connected, voltage})を画面に反映する
function Update_Pico(state){
	if(state.connected === true){ bluetooth.innerHTML = "Bluetooth<br>Connected"; }
	else{ bluetooth.innerHTML = "Bluetooth<br>No Connection"; }

	if(state.connected === true && typeof state.voltage === 'number'){
		battery.innerHTML = "battery<br>" + state.voltage.toFixed(2) + " V";
	}else{
		battery.innerHTML = "battery<br>None";
	}
}






//bluetooth送る
//speed:0~10, radian:-90~90, giar:0~6 に丸めて送る(Python側の範囲に合わせる)
function Clamp_Int(value, lo, hi){
	var v = Math.round(Number(value));
	if(!Number.isFinite(v)){ v = 0; }		//NaNを送るとPythonが落ちるため
	return Math.max(lo, Math.min(hi, v));
}

function Ble_Sent(){
	if(ws === null || ws.readyState !== WebSocket.OPEN){ return; }

	ws.send(JSON.stringify({
		speed : Clamp_Int(moter_speed / 10, 0, 10),		//0~100%を0~10に変換
		radian: Clamp_Int(moter_degree, -90, 90),
		giar  : Clamp_Int(moter_giar, 0, 6)
	}));
}

//値が変わらなくても一定間隔で送り続ける(止まるとPython側が停止指令にする)
setInterval(Ble_Sent, SEND_INTERVAL_MS);


//bluetooth受け取る
function Ble_Catch(event){
	try{
		Update_Pico( JSON.parse(event.data) );
	}catch(e){
		console.log("受信エラー:", e);
	}
}


//WebSocket接続(切れたら2秒後に自動で再接続)
function Connect_WS(){
	ws = new WebSocket(WS_URL);

	ws.onopen = () => { Wifi_Config(); };
	ws.onmessage = Ble_Catch;
	ws.onclose = () => {
		Wifi_Config();
		Update_Pico({ connected:false, voltage:null });
		setTimeout(Connect_WS, 2000);
	};
}


//起動
Update_Number();
Update_Pico({ connected:false, voltage:null });
if(MY_ID >= 1 && MY_ID <= 3){ Connect_WS(); }