export {};
const command = process.argv[2];
if (command === "deploy") await import("./sepolia-token-deploy.ts");
else if (command === "mint") await import("./sepolia-token-mint.ts");
else throw new Error("Usage: sepolia-token.ts <deploy|mint>");
