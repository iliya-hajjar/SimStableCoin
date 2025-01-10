async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with account:", deployer.address);

    const SimStable = await ethers.getContractFactory("SimStable");
    const simStable = await SimStable.deploy();
    await simStable.deployed();

    const SimGov = await ethers.getContractFactory("SimGov");
    const simGov = await SimGov.deploy();
    await simGov.deployed();

    const CentralVault = await ethers.getContractFactory("CentralVault");
    const centralVault = await CentralVault.deploy(simStable.address, simGov.address);
    await centralVault.deployed();

    console.log("SimStable deployed to:", simStable.address);
    console.log("SimGov deployed to:", simGov.address);
    console.log("CentralVault deployed to:", centralVault.address);

    // Set the vault address in SimStable and SimGov
    await simStable.setVault(centralVault.address);
    await simGov.setVault(centralVault.address);

    console.log("Vault set in SimStable and SimGov contracts");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
