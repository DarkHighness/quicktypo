const process = require("process");
const child_process = require("child_process");

const fs = require("fs");
const deasync = require('deasync');

const USER_HOME = process.env.HOME || process.env.USERPROFILE;
const DEFAULT_HISTORY_PATH =
    USER_HOME + "\\AppData\\Roaming\\Typora\\history.data";

function getTyporaExecPath() {
    let done = false;
    let path = "";
    child_process.exec("REG QUERY \"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Typora.exe\" /ve",
        (err,stdout,stderr) => {
            let strings = stdout.split(/[\s\n]/).filter(v => v.length > 0);
            let index = strings.indexOf("REG_SZ");
            path = strings[index + 1];
            for(let i = index + 2; i < strings.length; i++)
                path = path + " " + strings[i];
            done = true;
        });

    deasync.loopWhile(() => { return !done });

    return path;
}


function getRecentDocument() {
    let db = deserializeDatabase(DEFAULT_HISTORY_PATH);
    let recentDocument = db.recentDocument;
    return recentDocument || [];
}

function getRecentFolder() {
    let db = deserializeDatabase(DEFAULT_HISTORY_PATH);
    let recentFolders = db.recentFolder;
    return recentFolders || [];
}

function deserializeDatabase(path) {
    let str = fs.readFileSync(path, "utf-8").trim();
    try {
        return JSON.parse(new Buffer.from(str || "", "hex").toString());
    } catch (e) {
        return {};
    }
}

function getRecent() {
    let recentDocument = getRecentDocument();
    let recentFolder = getRecentFolder();
    return recentDocument.map(v => {
        return {
            title: v["name"],
            description: "文件路径: " + v["path"],
            icon: "file.ico",
            path: v["path"]
        };
    }).concat(recentFolder.map(v => {
        return {
            title: v["name"],
            description: "目录路径: " + v["path"],
            icon: "folder.ico",
            path: v["path"]
        };
    }));
}

window.exports = {
    Typora: {
        mode: "list",
        args: {
            enter: (action, callbackSetList) => {
                window._typora_cache = getRecent();
                window._typora_exec = getTyporaExecPath();
                callbackSetList(window._typora_cache);
            },
            search: (action, searchWord, callbackSetList) => {
                let lower = searchWord.toLowerCase();

                callbackSetList(
                    window._typora_cache.filter(v => {
                        return (
                            v.title.toLowerCase().search(lower) !== -1 ||
                            v.description.toLowerCase().search(lower) !== -1
                        );
                    })
                );
            },
            select: (action, itemData, callbackSetList) => {
                window.utools.hideMainWindow();
                const url = itemData.path;
                child_process.spawn(window._typora_exec, [url], {
                    detached: true
                });
                window._typora_cache = null;
                window.utools.outPlugin();
            },
            placeholder: ""
        }
    }
};