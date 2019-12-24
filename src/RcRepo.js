const fs=require("fs");
const path=require("path");
const Revision=require("./Revision");
const Remote=require("./Remote");

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

		for (let data of datas) {
			let remote=new Remote(data);
			this.remotes.push(remote);
		}

		return this.remotes;
	}

	info() {
		console.log("Local Path:   "+this.findRepoDir());
		console.log("Remote Paths: ");
		for (let remote of this.getRemotes())
			console.log("  "+remote.getRclonePath());
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
		return this.findRepoDir()+"/.rcrepo";
	}

	async makeBase() {
		let localRevision=await Revision.load(this.findRepoDir());
		localRevision.saveJson(this.getRepoStatusDir()+"/base-revision.json");
	}

	async localStatus(options) {
		let localRevision=await Revision.load(this.findRepoDir());
		let baseRevision=Revision.loadJson(this.getRepoStatusDir()+"/base-revision.json");
		let names=Revision.allFileNames([localRevision,baseRevision]);

		for (let name of names) {
			let status=localRevision.getStatusAgainstBase(name,baseRevision);
			if (status!="up-to-date" || options.all)
				console.log("  "+this.statusChars[status]+"  "+name);
		}

		console.log("Files: "+names.length);
	}

	async loadRemoteRevisions() {
		let remoteRevisions=[];
		for (let remote of this.getRemotes())
			remoteRevisions.push(Revision.load(remote.getRclonePath()));		

		return await Promise.all(remoteRevisions);
	}

	async status(options) {
		let start=new Date();
		let localRevision=await Revision.load(this.findRepoDir());
		let baseRevision=Revision.loadJson(this.getRepoStatusDir()+"/base-revision.json");
		let remoteRevisions=await this.loadRemoteRevisions();
		let names=Revision.allFileNames([localRevision,baseRevision,...remoteRevisions]);

		for (let name of names) {
			let status, haveDirty=false, s="  ";

			status=localRevision.getStatusAgainstBase(name,baseRevision);
			if (status!="up-to-date")
				haveDirty=true;

			s+=this.statusChars[status];

			for (let remoteRevision of remoteRevisions) {
				status=remoteRevision.getStatusAgainstBase(name,baseRevision);
				if (status!="up-to-date")
					haveDirty=true;

				s+=this.statusChars[status];
			}

			s+="  "+name;

			if (options.all || haveDirty)
				console.log(s);
		}

		let time=new Date()-start;
		console.log("Files: "+names.length+", Time: "+(time/1000)+"s");
	}

	async fill(options) {
		let start=new Date();
		let localRevision=await Revision.load(this.findRepoDir());
		let remoteRevisions=await this.loadRemoteRevisions();
		let allRevisions=[localRevision,...remoteRevisions]
		let names=Revision.allFileNames(allRevisions);

		for (let name of names) {
			let latestRevision=Revision.revisionWithLatest(name,allRevisions);

			if (!localRevision.getFileInfoByPath(name)) {
				let index=1+remoteRevisions.indexOf(latestRevision);
				console.log("  <- "+index+"  "+name);

				if (!options["dry-run"])
					await latestRevision.copyTo(name,localRevision);
			}

			for (let revision of remoteRevisions) {
				if (!revision.getFileInfoByPath(name)) {
					let index=1+remoteRevisions.indexOf(revision);
					console.log("  -> "+index+"  "+name);

					if (!options["dry-run"])
						await localRevision.copyTo(name,revision);
				}
			}
		}
		let time=new Date()-start;
		console.log("Time: "+(time/1000)+"s");
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
				for (let revision of cands) {

				}
				console.log("Conflict: "+name);
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
