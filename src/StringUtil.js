const readline=require("readline");

class StringUtil {
	static ask(prompt) {
		const rl=readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});  

		let prom=new Promise((resolve, reject) => {
			rl.question(prompt, (input)=>{
				rl.close();
				resolve(input);
			});
		});

		return prom;
	}
}

module.exports=StringUtil;