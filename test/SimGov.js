const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimGov Contract", function () {
    let SimGov;
    let simGov;
    let owner;
    let addr1;
    let addr2;
    let vault;

    beforeEach(async function () {
        // Get the contract factory and signers
        SimGov = await ethers.getContractFactory("SimGov");
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy the SimGov contract
        simGov = await SimGov.deploy();

        // Set the vault address
        vault = owner; // Assuming the owner sets the vault
        await simGov.setVault(vault.address);
    });

    describe("Vault management", function () {
        it("Should set the vault address correctly", async function () {
            expect(await simGov.vault()).to.equal(vault.address);
        });

        it("Should not allow setting vault address twice", async function () {
            await expect(simGov.setVault(addr1.address)).to.be.revertedWith("Vault already set");
        });
    });

    describe("Minting and Burning", function () {
        it("Should allow the vault to mint SimGov tokens", async function () {
            await simGov.mint(addr1.address, 1000);
            expect(await simGov.balanceOf(addr1.address)).to.equal(1000);
        });

        it("Should not allow non-vault address to mint tokens", async function () {
            await expect(simGov.connect(addr1).mint(addr2.address, 1000)).to.be.revertedWith("Only the vault can mint");
        });

        it("Should allow the vault to burn SimGov tokens", async function () {
            await simGov.mint(addr1.address, 1000);
            await simGov.burn(addr1.address, 500);
            expect(await simGov.balanceOf(addr1.address)).to.equal(500);
        });

        it("Should not allow non-vault address to burn tokens", async function () {
            await simGov.mint(addr1.address, 1000);
            await expect(simGov.connect(addr1).burn(addr1.address, 500)).to.be.revertedWith("Only the vault can burn");
        });
    });
});
