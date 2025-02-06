const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SimGov", function () {

    async function deploySimGovFixture() {
        // Get signers
        const [owner, vault, user] = await ethers.getSigners();

        // Deploy the SimGov contract
        const SimGov = await ethers.getContractFactory("SimGov");
        const simGov = await SimGov.deploy(owner.address);

        return { simGov, owner, vault, user };
    }

    describe("Deployment", function () {
        it("Should deploy with the correct name and symbol", async function () {
            const { simGov } = await loadFixture(deploySimGovFixture);
            expect(await simGov.name()).to.equal("SimGov");
            expect(await simGov.symbol()).to.equal("SIMG");
        });

        it("Should set the correct owner", async function () {
            const { simGov, owner } = await loadFixture(deploySimGovFixture);
            expect(await simGov.owner()).to.equal(owner.address);
        });
    })

    describe("setVault", function () {
        it("Should allow the owner to set the vault", async function () {
            const { simGov, owner, vault } = await loadFixture(deploySimGovFixture);
            await simGov.connect(owner).setVault(vault.address);
            expect(await simGov.vault()).to.equal(vault.address);
        });

        it("Should emit the VaultSet event", async function () {
            const { simGov, owner, vault } = await loadFixture(deploySimGovFixture);
            await expect(simGov.connect(owner).setVault(vault.address))
                .to.emit(simGov, "VaultSet")
                .withArgs(vault.address);
        });

        it("Should revert if the vault is already set", async function () {
            const { simGov, owner, vault } = await loadFixture(deploySimGovFixture);

            // First call: Set the vault (should succeed)
            await simGov.connect(owner).setVault(vault.address);

            // Second call: Attempt to set the vault again (should revert)
            await expect(simGov.connect(owner).setVault(vault.address)).to.be.revertedWith(
                "Vault already set"
            );
        });

        it("Should revert if called by a non-owner", async function () {
            const { simGov, user, vault } = await loadFixture(deploySimGovFixture);

            // Ensure `user` is a valid signer
            expect(user.address).to.be.properAddress;

            // Attempt to set the vault with a non-owner (should revert with custom error)
            await expect(simGov.connect(user).setVault(vault.address))
                .to.be.revertedWithCustomError(simGov, "OwnableUnauthorizedAccount")
                .withArgs(user.address);
        });
    });

    describe("mint", function () {
        it("Should allow the vault to mint tokens", async function () {
            const { simGov, owner, vault, user } = await loadFixture(deploySimGovFixture);
            const amount = 100;
            await simGov.connect(owner).setVault(vault.address);
            await simGov.connect(vault).mint(user.address, amount);

            expect(await simGov.balanceOf(user.address)).to.equal(amount);
        });

        it("Should emit the TokensMinted event", async function () {
            const { simGov, owner, vault, user } = await loadFixture(deploySimGovFixture);
            const amount = 50;
            await simGov.connect(owner).setVault(vault.address);
            await expect(simGov.connect(vault).mint(user.address, amount))
                .to.emit(simGov, "TokensMinted")
                .withArgs(user.address, amount);
        });

        it("Should revert if called by a non-vault", async function () {
            const { simGov, user } = await loadFixture(deploySimGovFixture);
            const amount = 100;
            await expect(simGov.connect(user).mint(user.address, amount)).to.be.revertedWith(
                "Only the vault can mint"
            );
        });

        it("Should revert if the amount is zero", async function () {
            const { simGov, owner, vault, user } = await loadFixture(deploySimGovFixture);
            await simGov.connect(owner).setVault(vault.address);
            await expect(simGov.connect(vault).mint(user.address, 0)).to.be.revertedWith(
                "Amount must be greater than zero"
            );
        });
    });

    describe("burn", function () {
        it("Should allow the vault to burn tokens", async function () {
            const { simGov, owner, vault, user } = await loadFixture(deploySimGovFixture);
            const mintAmount = 100;
            const burnAmount = 50;

            // Mint tokens to the user
            await simGov.connect(owner).setVault(vault.address);
            await simGov.connect(vault).mint(user.address, mintAmount);

            // Approve the vault to burn tokens
            await simGov.connect(user).approve(vault.address, burnAmount);

            // Burn tokens
            await simGov.connect(vault).burn(user.address, burnAmount);

            expect(await simGov.balanceOf(user.address)).to.equal(mintAmount-burnAmount);
        });

        it("Should emit the TokensBurned event", async function () {
            const { simGov, owner, vault, user } = await loadFixture(deploySimGovFixture);
            const amount = 50;

            // Mint tokens to the user
            await simGov.connect(owner).setVault(vault.address);
            await simGov.connect(vault).mint(user.address, amount);

            // Approve the vault to burn tokens
            await simGov.connect(user).approve(vault.address, amount);

            // Burn tokens
            await expect(simGov.connect(vault).burn(user.address, amount))
                .to.emit(simGov, "TokensBurned")
                .withArgs(user.address, amount);
        });

        it("Should revert if called by a non-vault", async function () {
            const { simGov, user } = await loadFixture(deploySimGovFixture);
            const amount = 100;
            await expect(simGov.connect(user).burn(user.address, amount)).to.be.revertedWith(
                "Only the vault can burn"
            );
        });

        it("Should revert if the amount is zero", async function () {
            const { simGov, owner, vault, user } = await loadFixture(deploySimGovFixture);
            await simGov.connect(owner).setVault(vault.address);
            await expect(simGov.connect(vault).burn(user.address, 0)).to.be.revertedWith(
                "Amount must be greater than zero"
            );
        });
    });
});