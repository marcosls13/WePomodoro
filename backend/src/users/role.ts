import { prisma } from "../prisma.js";

const username = process.argv.at(2)?.toLowerCase();
const role = process.argv.at(3)?.toUpperCase();

async function setRole() {
  if (
    !username ||
    (role !== "ADMIN" && role !== "MODERATOR" && role !== "USER")
  )
    throw new Error(
      "Usage: npm run users:role -- <username> admin|moderator|user",
    );
  await prisma.user.update({ where: { username }, data: { role } });
  console.log(`${username} is now ${role}`);
}
void setRole()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
