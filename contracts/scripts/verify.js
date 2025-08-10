"use strict";

const { ethers } = require("hardhat");
const { verifyContract } = require("../utils/verify");
const { CONSTRUCTOR_ARGS } = require("./args");

async function main() {
  const { chainId } = await ethers.provider.getNetwork();

  const contractName = "PaymentProcessor";
  const contractPath = `contracts/${contractName}.sol:${contractName}`;
  const contractAddress = "0x19130aAf491aDFE04ec20F89dD747Aff40341172";

  const args = CONSTRUCTOR_ARGS[chainId];

  await verifyContract({
    contractPath,
    contractAddress,
    args,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
