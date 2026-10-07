import { prisma } from "../prisma.js";

const action = process.argv.at(2);
const key = process.argv.at(3);
const name = process.argv.at(4);
async function manage() {
  if (
    !key ||
    !/^[a-z0-9-]{1,64}$/.test(key) ||
    !["add", "enable", "disable"].includes(action ?? "")
  )
    throw new Error(
      'Usage: npm run games:manage -- add|enable|disable game-key "Game name"',
    );
  if (action === "add") {
    if (!name?.trim() || name.length > 80)
      throw new Error("Game name must be 1–80 characters");
    await prisma.miniGame.upsert({
      where: { key },
      create: { key, name: name.trim() },
      update: { name: name.trim() },
    });
  } else
    await prisma.miniGame.update({
      where: { key },
      data: { isEnabled: action === "enable" },
    });
  console.log(`Game ${key}: ${action ?? ""}`);
}
void manage()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
