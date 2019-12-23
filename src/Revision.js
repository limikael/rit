const child_process=require("child_process");
const fs=require("fs");
const path=require("path");
const Minimatch=require("minimatch").Minimatch;

function escapeShellArg (arg) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
}

class Revision {
	static load(rclonePath) {
		let json=child_process.execSync("rclone lsjson -R "+rclonePath).toString();
		let revision=new Revision();
		revision.data=JSON.parse(json);
		revision.filterData();
		revision.prepareData();
		revision.label=rclonePath;
		revision.rclonePath=rclonePath;

		return revision;
	}

	static loadJson(fn) {
		let json=fs.readFileSync(fn);
		let revision=new Revision();
		revision.data=JSON.parse(json);
		revision.filterData();
		revision.prepareData();
		revision.label="base";

		return revision;
	}

	copyTo(filePath, revision) {
		let cmd="rclone copy "+
			escapeShellArg(this.rclonePath+"/"+filePath)+
			" "+
			escapeShellArg(revision.rclonePath+"/"+path.dirname(filePath));
		child_process.execSync(cmd);
	}

	saveJson(fn) {
		fs.writeFileSync(fn,JSON.stringify(this.data,null,2));
	}

	filterData() {
		let newData=[];
		let m=new Minimatch(".rcrepo/*");

		for (let dataItem of this.data) {
			if (!dataItem.IsDir && !m.match(dataItem.Path))
				newData.push(dataItem)
		}

		this.data=newData;
	}

	prepareData() {
		for (let dataItem of this.data)
			dataItem.date=new Date(dataItem.ModTime);
	}

	static allFileNames(revisions) {
		let names=[];

		for (let revision of revisions) {
			for (let fileInfo of revision.data)
				if (!names.includes(fileInfo.Path))
					names.push(fileInfo.Path);
		}

		return names;
	}

	getFileInfoByPath(path) {
		for (let fileInfo of this.data)
			if (path==fileInfo.Path)
				return fileInfo;

		return null;
	}

	getStatusAgainstBase(path, baseRevision) {
		let localInfo=this.getFileInfoByPath(path);
		let baseInfo=baseRevision.getFileInfoByPath(path);
		let dateTolerance=1000;

		if (localInfo && !baseInfo)
			return "new";

		else if (baseInfo && !localInfo)
			return "missing";

		else if (Math.abs(baseInfo.date-localInfo.date)>dateTolerance) {
			return "modified";
		}

		else return "up-to-date";
	}

	static revisionWithLatest(revisions, path) {
		let latestRevision=null;

		for (let revision of revisions) {
			let info=revision.getFileInfoByPath(path);

			if (info)
				latestRevision=revision;
		}

		return latestRevision;
	}
};

module.exports=Revision;
