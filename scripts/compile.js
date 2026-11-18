// Compile the contracts with solc-js and write ABI + bytecode to artifacts/.
//
// PREREQUISITE (needs network once):
//   npm install --save-dev solc@0.8.28
//
// USAGE:
//   node scripts/compile.js
//
// OUTPUT:
//   artifacts/AgentIdDailyCheckin.json  { abi, bytecode, deployedBytecode }
//   artifacts/MockAgentId.json          { abi, bytecode, deployedBytecode }
//
// The compiler settings below are the exact settings BscScan verification
// must use (see scripts/verify.js): Solidity 0.8.28, optimizer enabled
// with 200 runs, no other flags.
const fs = require("fs");
const path = require("path");

let solc;
try {
  solc = require("solc");
} catch (e) {
  console.error(
    "ERROR: the 'solc' package is not installed.\n" +
      "Run: npm install --save-dev solc@0.8.28\n" +
      "(needs network access to the npm registry)"
  );
  process.exit(1);
}

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");
const COMPILER_VERSION = "0.8.28";

function compileContract(fileName, contractName) {
  const source = fs.readFileSync(path.join(CONTRACTS_DIR, fileName), "utf8");
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === "error");
    const warnings = output.errors.filter((e) => e.severity !== "error");
    warnings.forEach((w) => console.warn("warning:", w.formattedMessage));
    if (errors.length > 0) {
      errors.forEach((e) => console.error(e.formattedMessage));
      throw new Error(`Compilation of ${contractName} failed`);
    }
  }
  const compiled = output.contracts[fileName][contractName];
  return {
    contractName,
    compilerVersion: COMPILER_VERSION,
    optimizer: { enabled: true, runs: 200 },
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedBytecode: "0x" + compiled.evm.deployedBytecode.object,
  };
}

function main() {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const targets = [
    ["AgentIdDailyCheckin.sol", "AgentIdDailyCheckin"],
    ["MockAgentId.sol", "MockAgentId"],
  ];
  for (const [file, name] of targets) {
    const artifact = compileContract(file, name);
    const outPath = path.join(ARTIFACTS_DIR, `${name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
    console.log(`compiled ${name}: ${artifact.bytecode.length / 2 - 1} bytes of bytecode -> ${outPath}`);
  }
  console.log("Done. Compiler settings: solc 0.8.28, optimizer on, 200 runs.");
}

main();
