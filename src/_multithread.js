const cluster = require("cluster");

if (cluster.isMaster) {
    const electron = require("electron");
    const ipc = electron.ipcMain;
    const signale = require("signale");
    const numCPUs = require("os").cpus().length - 1; // Leave a core available for the renderer process

    const si = require("systeminformation");

    cluster.setupMaster({
        exec: require("path").join(__dirname, "_multithread.js")
    });

    let workers = [];
    cluster.on("fork", worker => {
        workers.push(worker.id);
    });

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    signale.success("Multithreaded controller ready");

    function dispatch(type, id, arg) {
        let selectedID = Math.floor(Math.random() * Math.floor(numCPUs - 1));

        cluster.workers[workers[selectedID]].send(JSON.stringify({
            id,
            type,
            arg
        }));
    }

    var queue = {};
    ipc.on("systeminformation-call", (e, type, id, ...args) => {
        if (!si[type]) {
            signale.warn("Illegal request for systeminformation");
            return;
        }

        if (args.length > 1) {
            si[type](...args).then(res => {
                if (e.sender) {
                    e.sender.send("systeminformation-reply-"+id, res);
                }
            });
        } else {
            queue[id] = e.sender;
            dispatch(type, id, args[0]);
        }
    });

    cluster.on("message", (worker, msg) => {
        msg = JSON.parse(msg);
        if (queue[msg.id]) {
            queue[msg.id].send("systeminformation-reply-"+msg.id, msg.res);
            delete queue[msg.id];
        }
    });
} else if (cluster.isWorker) {
    const signale = require("signale");
    const si = require("systeminformation");

    signale.info("Multithread worker started at "+process.pid);

    process.on("message", msg => {
        msg = JSON.parse(msg);
        si[msg.type](msg.arg).then(res => {
            process.send(JSON.stringify({
                id: msg.id,
                res
            }));
        });
    });
}