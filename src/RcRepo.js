const fs=require("fs");
const path=require("path");
const Revision=require("./Revision");

class RcRepo {
	constructor() {
		this.cwd=process.cwd();
		this.statusChars={
			"new": "N",
			"missing": "X",
			"deleted": "D",
			"modified": "M",
			"up-to-date": "-"
		}
	}

	getRemotes() {
		if (this.remotes)
			return this.remotes;

		this.remotes=[];
		let json=fs.readFileSync(this.getRepoStatusDir()+"/remote-paths.json")
		let datas=JSON.parse(json);

		for (let remotePath of datas)
			this.remotes.push(remotePath);

		return this.remotes;
	}

	async init() {
		let repoDir=this.findRepoDir();

		if (repoDir) {
			console.log("Already initialized: "+repoDir);
			return;
		}

		repoDir=path.resolve(this.cwd);
		console.log("Initializing repo in: "+repoDir);

		fs.mkdirSync(repoDir+"/.rcrepo");

		let localRevision=await Revision.load(this.findRepoDir());
		localRevision.saveJson(this.getRepoStatusDir()+"/base-revision.json");

		fs.writeFileSync(this.getRepoStatusDir()+"/remote-paths.json","[]");
	}

	findRepoDir() {
		let p=path.resolve(this.cwd);

		while (1) {
			if (fs.existsSync(p+"/.rcrepo"))
				return p;

			if (p==path.resolve(p+"/.."))
				return null;

			p=path.resolve(p+"/..");
		}
	}

	async loadLocalRevision() {
		return await Revision.load(this.findRepoDir());
	}

	getRepoStatusDir() {
		let repoDir=this.findRepoDir();

		if (!repoDir)
			throw new Error("No repo found here.");

		return repoDir+"/.rcrepo";
	}

	async loadRemoteRevisions() {
		let remoteRevisions=[];
		for (let remote of this.getRemotes())
			remoteRevisions.push(Revision.load(remote));

		return await Promise.all(remoteRevisions);
	}

	async haveLocalModifications() {
		let repoDir=this.findRepoDir();

		if (!repoDir) {
			console.log("No repo.");
			return;
		}

		let localRevision=await Revision.load(this.findRepoDir());
		let baseRevision=Revision.loadJson(this.getRepoStatusDir()+"/base-revision.json");
		let names=Revision.allFileNames([localRevision,baseRevision]);

		let haveDirty=false;
		for (let name of names) {
			let status=localRevision.getStatusAgainstBase(name,baseRevision);
			if (status!="up-to-date")
				haveDirty=true;
		}

		return haveDirty;
	}

	async status(options) {
		let repoDir=this.findRepoDir();

		if (!repoDir) {
			console.log("No repo.");
			return;
		}

		console.log("Local Path: "+repoDir);
		console.log("Remote Paths: ");
		for (let remote of this.getRemotes())
			console.log("  "+remote);

		console.log("");
		console.log("Files:");

		let start=new Date();
		let localRevision=await Revision.load(this.findRepoDir());
		let baseRevision=Revision.loadJson(this.getRepoStatusDir()+"/base-revision.json");
		let remoteRevisions=await this.loadRemoteRevisions();
		let names=Revision.allFileNames([localRevision,baseRevision,...remoteRevisions]);

		for (let name of names) {
			let cands=baseRevision.getRevCands(name,[localRevision,...remoteRevisions]);

			if (cands.length==1) {
				let status=cands[0].getStatusAgainstBase(name,baseRevision);
				console.log("  "+this.statusChars[status]+" "+name);
			}

			else if (cands.length) {
				console.log("  C "+name);
			}
		}

		let time=new Date()-start;
		console.log("");
		console.log("Total Files: "+names.length+", Time: "+(time/1000)+"s");
	}

	async addRemote(args) {
		if (args._.length!=1)
			throw new Error("Usage: addremote <remote:path>")

		if (await this.haveLocalModifications())
			throw new Error("There are local modifications, can't add remote.")

		let argRemote=args._[0];
		let json=fs.readFileSync(this.getRepoStatusDir()+"/remote-paths.json")
		let remotes=JSON.parse(json);

		if (remotes.includes(argRemote))
			throw new Error("Already added: "+argRemote);

		let localRevision=await Revision.load(this.findRepoDir());
		let remoteRevision=await Revision.load(argRemote);
		let names=Revision.allFileNames([localRevision]);

		for (let name of names) {
			if (!remoteRevision.getFileInfoByPath(name)) {
				console.log("  -> "+name);

				if (!args["dry-run"])
					await localRevision.copyTo(name,remoteRevision);
			}
		}

		if (!args["dry-run"]) {
			remotes.push(argRemote);
			fs.writeFileSync(this.getRepoStatusDir()+"/remote-paths.json",JSON.stringify(remotes));
		}
	}

	async rmRemote(args) {
		if (args._.length!=1)
			throw new Error("Usage: addremote <remote:path>")

		let argRemote=args._[0];
		let json=fs.readFileSync(this.getRepoStatusDir()+"/remote-paths.json")
		let remotes=JSON.parse(json);

		if (!remotes.includes(argRemote))
			throw new Error("No such remote: "+argRemote);

		remotes.splice(remotes.indexOf(argRemote),1);
		fs.writeFileSync(this.getRepoStatusDir()+"/remote-paths.json",JSON.stringify(remotes));
	}

	async sync(options) {
		let start=new Date();
		let localRevision=await Revision.load(this.findRepoDir());
		let baseRevision=Revision.loadJson(this.getRepoStatusDir()+"/base-revision.json");
		let remoteRevisions=await this.loadRemoteRevisions();
		let names=Revision.allFileNames([localRevision,baseRevision,...remoteRevisions]);

		for (let name of names) {
			let cands=baseRevision.getRevCands(name,[localRevision,...remoteRevisions]);
			let cand=null;

			if (cands.length==1)
				cand=cands[0]

			else if (cands.length>1) {
				console.log("Conflict: "+name);
				for (let revision of cands) {
					let status=revision.getStatusAgainstBase(name,baseRevision);
					console.log("  - "+status+" at "+revision.label);
				}
			}

			if (cand) {
				let status=cand.getStatusAgainstBase(name,baseRevision);
				console.log(status+": "+name);

				if (cand.getFileInfoByPath(name)) {
					if (cand!=localRevision)
						await cand.copyTo(name,localRevision);

					for (let remote of remoteRevisions) {
						if (remote!=cand)
							await localRevision.copyTo(name,remote);
					}

					await cand.copyTo(name,baseRevision);
					baseRevision.saveJson(this.getRepoStatusDir()+"/base-revision.json");
				}

				else {
					for (let revision of [baseRevision,localRevision,...remoteRevisions])
						await revision.deleteIfExists(name);

					baseRevision.saveJson(this.getRepoStatusDir()+"/base-revision.json");
				}
			}
		}

		let time=new Date()-start;
		console.log("Time: "+(time/1000)+"s");
	}
};

module.exports=RcRepo;
