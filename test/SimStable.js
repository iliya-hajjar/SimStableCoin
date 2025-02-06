const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SimStable", function () {
    async function deploySimStableFixture() {
        // Get signers
        const [owner, vault, user] = await ethers.getSigners();

        // Deploy the SimStable contract
        const SimStable = await ethers.getContractFactory("SimStable");
        const simStable = await SimStable.deploy(owner.address);

        return { simStable, owner, vault, user };
    }

    describe("Deployment", function () {
        it("Should deploy with the correct name and symbol", async function () {
            const { simStable } = await loadFixture(deploySimStableFixture);
            expect(await simStable.name()).to.equal("SimStable");
            expect(await simStable.symbol()).to.equal("SIMS");
        });

        it("Should set the correct owner", async function () {
            const { simStable, owner } = await loadFixture(deploySimStableFixture);
            expect(await simStable.owner()).to.equal(owner.address);
        });
    });

    describe("setVault", function () {
        it("Should allow the owner to set the vault", async function () {
            const { simStable, owner, vault } = await loadFixture(deploySimStableFixture);
            await simStable.connect(owner).setVault(vault.address);
            expect(await simStable.vault()).to.equal(vault.address);
        });

        it("Should emit the VaultSet event", async function () {
            const { simStable, owner, vault } = await loadFixture(deploySimStableFixture);
            await expect(simStable.connect(owner).setVault(vault.address))
                .to.emit(simStable, "VaultSet")
                .withArgs(vault.address);
        });

        it("Should revert if the vault is already set", async function () {
            const { simStable, owner, vault } = await loadFixture(deploySimStableFixture);

            // First call: Set the vault (should succeed)
            await simStable.connect(owner).setVault(vault.address);

            // Second call: Attempt to set the vault again (should revert)
            await expect(simStable.connect(owner).setVault(vault.address)).to.be.revertedWith(
                "Vault already set"
            );
        });

        it("Should revert if called by a non-owner", async function () {
            const { simStable, user, vault } = await loadFixture(deploySimStableFixture);

            // Attempt to set the vault with a non-owner (should revert with custom error)
            await expect(simStable.connect(user).setVault(vault.address))
                .to.be.revertedWithCustomError(simStable, "OwnableUnauthorizedAccount")
                .withArgs(user.address);
        });
    });

    describe("mint", function () {
        it("Should allow the vault to mint tokens", async function () {
            const { simStable, owner, vault, user } = await loadFixture(deploySimStableFixture);
            const amount = 100;
            await simStable.connect(owner).setVault(vault.address);
            await simStable.connect(vault).mint(user.address, amount);

            expect(await simStable.balanceOf(user.address)).to.equal(amount);
        });

        it("Should emit the TokensMinted event", async function () {
            const { simStable, owner, vault, user } = await loadFixture(deploySimStableFixture);
            const amount = 50;
            await simStable.connect(owner).setVault(vault.address);
            await expect(simStable.connect(vault).mint(user.address, amount))
                .to.emit(simStable, "TokensMinted")
                .withArgs(user.address, amount);
        });

        it("Should revert if called by a non-vault", async function () {
            const { simStable, user } = await loadFixture(deploySimStableFixture);
            const amount = 100;
            await expect(simStable.connect(user).mint(user.address, amount)).to.be.revertedWith(
                "Only the vault can mint"
            );
        });

        it("Should revert if the amount is zero", async function () {
            const { simStable, owner, vault, user } = await loadFixture(deploySimStableFixture);
            await simStable.connect(owner).setVault(vault.address);
            await expect(simStable.connect(vault).mint(user.address, 0)).to.be.revertedWith(
                "Amount must be greater than zero"
            );
        });
    });

    describe("burn", function () {
        it("Should allow the vault to burn tokens", async function () {
            const { simStable, owner, vault, user } = await loadFixture(deploySimStableFixture);
            const mintAmount = 100;
            const burnAmount = 50;

            // Mint tokens to the user
            await simStable.connect(owner).setVault(vault.address);
            await simStable.connect(vault).mint(user.address, mintAmount);

            // Approve the vault to burn tokens
            await simStable.connect(user).approve(vault.address, burnAmount);

            // Burn tokens
            await simStable.connect(vault).burn(user.address, burnAmount);

            expect(await simStable.balanceOf(user.address)).to.equal(mintAmount-burnAmount);
        });

        it("Should emit the TokensBurned event", async function () {
            const { simStable, owner, vault, user } = await loadFixture(deploySimStableFixture);
            const amount = 50;

            // Mint tokens to the user
            await simStable.connect(owner).setVault(vault.address);
            await simStable.connect(vault).mint(user.address, amount);

            // Approve the vault to burn tokens
            await simStable.connect(user).approve(vault.address, amount);

            // Burn tokens
            await expect(simStable.connect(vault).burn(user.address, amount))
                .to.emit(simStable, "TokensBurned")
                .withArgs(user.address, amount);
        });

        it("Should revert if called by a non-vault", async function () {
            const { simStable, user } = await loadFixture(deploySimStableFixture);
            const amount = 100;
            await expect(simStable.connect(user).burn(user.address, amount)).to.be.revertedWith(
                "Only the vault can burn"
            );
        });

        it("Should revert if the amount is zero", async function () {
            const { simStable, owner, vault, user } = await loadFixture(deploySimStableFixture);
            await simStable.connect(owner).setVault(vault.address);
            await expect(simStable.connect(vault).burn(user.address, 0)).to.be.revertedWith(
                "Amount must be greater than zero"
            );
        });
    });
});