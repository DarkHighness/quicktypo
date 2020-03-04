const process = require("process");
const child_process = require("child_process");

const fs = require("fs");
const fp = fs.promises;
const path = require("path");

function getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
}

function getDefaultTyporaHistoryPath(){
    return path.join(getUserHome(),"/AppData/Roaming","/Typora/history.data")
}

function parseRegQueryOutput(output){
    const strings = output.split(/[\s\n]/).filter(seg => seg.length > 0);
    const index = strings.indexOf("REG_SZ");
    let fullPath = strings[index + 1];
    for(let i = index + 2; i < strings.length; i++)
        fullPath = fullPath + " " + strings[i];
    return fullPath;
}

async function getTyporaExecutablePath(){
    return new Promise((resolve, reject) => {
        child_process.exec("REG QUERY \"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Typora.exe\" /ve",
            (err,stdout,stderr) => {
            if(err){
                reject(err);
            }
            else {
                resolve(parseRegQueryOutput(stdout));
            }
        } )
    })
}

async function getTyporaFileIconPath(fullPath){
    const parsedPath = path.parse(fullPath);
    const dir = parsedPath['dir'];
    const assetsPath = path.join(dir,"/resources/app/asserts");

    const fileIco = "file://" + path.join(assetsPath,"file.ico");
    const appIco = "file://" + path.join(assetsPath,"app.ico");

    return Promise.resolve([fileIco,appIco])
}

async function deserializeDatabase(fullPath) {
    const data = await fp.readFile(fullPath, { encoding: "utf-8"});
    try{
        const buffer = new Buffer.from(data || "", "hex");
        const json = JSON.parse(buffer.toString());
        return Promise.resolve(json);
    }
    catch (error) {
        return Promise.reject(error);
    }
}

async function getRecentDocumentAndFolder(){
    const fullPath = getDefaultTyporaHistoryPath();
    const db = await deserializeDatabase(fullPath);
    const execPath = await getTyporaExecutablePath();
    const ico = await getTyporaFileIconPath(execPath);
    let document = db.recentDocument || [];
    let folder = db.recentFolder || [];

    console.log("数据库记录的最近文档", document);
    console.log("数据库记录的最近目录", folder);

    document = document.filter(doc => {
        return fs.existsSync(doc['path']);
    });

    folder = folder.filter(fold => {
        return fs.existsSync(fold['path']);
    });

    console.log("有效的最近文档", document);
    console.log("有效的最近目录", folder);

    const result = document.map(v => {
        return {
            title: v["name"],
            description: "文件路径: " + v["path"],
            icon: ico[0],
            path: v["path"]
        };
    }).concat(folder.map(v => {
        return {
            title: v["name"],
            description: "目录路径: " + v["path"],
            icon: ico[1],
            path: v["path"]
        };
    }));
    return Promise.resolve(result);
}

async function get(callback) {
    const result = await getRecentDocumentAndFolder();

    if (typeof window != "undefined") {
        window.__typo__cache = result;
    }

    callback(result);

    return Promise.resolve();
}

async function search(word, callback) {
    let cache = null;

    if (typeof window != "undefined") {
        if (window.__typo__cache == null) {
            window.__typo__cache = await getRecentDocumentAndFolder();
            cache = window.__typo__cache;
        }
    }

    if (cache == null)
        cache = await getRecentDocumentAndFolder();

    const lower = word.toLowerCase();

    callback(
        cache.filter(v => {
            return (
                v.title.toLowerCase().search(lower) !== -1 ||
                v.description.toLowerCase().search(lower) !== -1
            );
        })
    );

    return Promise.resolve();
}

async function execute(data) {
    if (typeof window != "undefined") {
        if (window.__typo__cache != null) {
            window.__typo__cache = null;
        }

        const execPath = await getTyporaExecutablePath();

        window.utools.hideMainWindow();
        child_process.spawn(execPath, [data["path"]], {
            detached: true
        });
        window.utools.outPlugin();
    }

    return Promise.resolve();
}

if(typeof window != "undefined"){
    window.exports = {
        Typo: {
            mode: "list",
            args: {
                enter: (action, callbackSetList) => {
                    get(callbackSetList)
                },
                search: (action, searchWord, callbackSetList) => {
                    search(searchWord,callbackSetList)
                },
                select: (action, itemData, callbackSetList) => {
                    execute(itemData)
                },
                placeholder: ""
            }
        }
    };
}

