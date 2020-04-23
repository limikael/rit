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

	static ucFirst(s) {
		if (!s || s=="")
			return s;

		return s.substr(0,1).toUpperCase()+s.substr(1);
	}
}

module.exports=StringUtil;