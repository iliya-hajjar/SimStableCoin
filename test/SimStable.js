const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimStable Contract", function () {
    let SimStable;
    let simStable;
    let owner;
    let addr1;
    let addr2;
    let vault;

    beforeEach(async function () {
        // Get the contract factory and signers
        SimStable = await ethers.getContractFactory("SimStable");
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy the SimStable contract
        simStable = await SimStable.deploy();

        // Assign the vault to the contract itself (or set vault in test setup)
        vault = owner; // Assuming the owner sets the vault
        await simStable.setVault(vault.address);
    });

    describe("Vault management", function () {
        it("Should set the vault address correctly", async function () {
            expect(await simStable.vault()).to.equal(vault.address);
        });

        it("Should not allow setting vault address twice", async function () {
            await expect(simStable.setVault(addr1.address)).to.be.revertedWith("Vault already set");
        });
    });

    describe("Minting and Burning", function () {
        it("Should allow the vault to mint SimStable tokens", async function () {
            await simStable.mint(addr1.address, 1000);
            expect(await simStable.balanceOf(addr1.address)).to.equal(1000);
        });

        it("Should not allow non-vault address to mint tokens", async function () {
            await expect(simStable.connect(addr1).mint(addr2.address, 1000)).to.be.revertedWith("Only the vault can mint");
        });

        it("Should allow the vault to burn SimStable tokens", async function () {
            await simStable.mint(addr1.address, 1000);
            await simStable.burn(addr1.address, 500);
            expect(await simStable.balanceOf(addr1.address)).to.equal(500);
        });

        it("Should not allow non-vault address to burn tokens", async function () {
            await simStable.mint(addr1.address, 1000);
            await expect(simStable.connect(addr1).burn(addr1.address, 500)).to.be.revertedWith("Only the vault can burn");
        });
    });
});
