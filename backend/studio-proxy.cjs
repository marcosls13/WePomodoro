// Prisma Studio only listens on 127.0.0.1 inside its container, which Docker can't
// publish. This forwards 0.0.0.0:5556 to it so `make studio` can expose it.
const net = require("node:net");

net
  .createServer((client) => {
    const studio = net.connect(5555, "127.0.0.1");
    client.on("error", () => studio.destroy());
    studio.on("error", () => client.destroy());
    client.pipe(studio);
    studio.pipe(client);
  })
  .listen(5556, "0.0.0.0");

// Node is PID 1 in the container: without handlers Ctrl+C would be ignored.
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => process.exit());
