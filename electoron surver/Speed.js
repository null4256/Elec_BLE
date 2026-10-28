//Speed処理定義
class Speed{
	moter_speed = 0;
	speed_flag = false;
	
	constructor(){
		this.speed_square = document.querySelector('.speed_square');
		this.speed_stick = document.querySelector('.speed_stick');
		this.speed = document.querySelector('.speed');
		this.speed_mater = document.querySelector('.speed_mater');
	}

	//speedのアップデート
	Up_Down_Speed=(event) =>{
		this.speed_stick.style.top = event.offsetY+'px';
		this.speed.style.height = (400-event.offsetY)+'px';
		this.speed_mater.textContent = "Speed:"+ (400-event.offsetY)/4 +"%";
		this.moter_speed = (400-event.offsetY)/4;
	}

	//Speedの処理
	Speed_Tap(){
		
		this.speed_square.addEventListener('mousedown',(event) => {
			this.speed_flag = true;
			this.Up_Down_Speed(event);
			});
		this.speed_square.addEventListener('mousemove',(event) => { if(this.speed_flag == true){ this.Up_Down_Speed(event); } } );
		window.addEventListener('mouseup', () => { this.speed_flag=false; } )

	}

}

export default Speed;