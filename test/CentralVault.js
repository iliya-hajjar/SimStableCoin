const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");


describe("CentralVault", function () {
    async function deployCentralVaultFixture() {
        // Get signers
        const [owner, user] = await ethers.getSigners();

        // Deploy SimGov
        const SimGov = await ethers.getContractFactory("SimGov");
        const simGov = await SimGov.deploy(owner.address);

        // Deploy SimStable
        const SimStable = await ethers.getContractFactory("SimStable");
        const simStable = await SimStable.deploy(owner.address);

        // Deploy Mock ERC20 as collateral token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const collateralToken = await MockERC20.deploy("Collateral", "COL", 1000000);

        // Deploy Mock Uniswap V2 Pair
        const MockUniswapV2Pair = await ethers.getContractFactory("MockUniswapV2Pair");
        const simStablePair = await MockUniswapV2Pair.deploy(simStable.target, collateralToken.target);
        const simGovPair = await MockUniswapV2Pair.deploy(simGov.target, collateralToken.target);

        // Deploy CentralVault
        const CentralVault = await ethers.getContractFactory("CentralVault");
        const centralVault = await CentralVault.deploy(
            simStable.target,
            simGov.target,
            collateralToken.target,
            simStablePair.target,
            simGovPair.target
        );

        // Set vault addresses in SimGov and SimStable
        await simGov.connect(owner).setVault(centralVault.target);
        await simStable.connect(owner).setVault(centralVault.target);

        return { centralVault, simGov, simStable, collateralToken, simStablePair, simGovPair, owner, user };
    }

    describe("Deployment", function () {
        it("Should deploy with the correct parameters", async function () {
            const { centralVault, simStable, simGov, collateralToken, simStablePair, simGovPair } = await loadFixture(deployCentralVaultFixture);

            expect(await centralVault.simStable()).to.equal(simStable.target);
            expect(await centralVault.simGov()).to.equal(simGov.target);
            expect(await centralVault.collateralToken()).to.equal(collateralToken.target);
            expect(await centralVault.simStablePair()).to.equal(simStablePair.target);
            expect(await centralVault.simGovPair()).to.equal(simGovPair.target);
        });
    });

    describe("Minting", function () {
        it("Should allow users to mint SimStable tokens", async function () {
            const { centralVault, simStable, simGov, collateralToken, owner, user } = await loadFixture(deployCentralVaultFixture);

            // Mint SimGov tokens to the user using CentralVault
            const govAmount = 50;
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);

            // Mint collateral tokens to the user
            const collateralAmount = 100;
            await collateralToken.connect(owner).mint(user.address, collateralAmount);

            // Approve CentralVault to spend collateral and SimGov tokens
            await collateralToken.connect(user).approve(centralVault.target, collateralAmount);
            await simGov.connect(user).approve(centralVault.target, govAmount);

            // Mint SimStable tokens
            await expect(centralVault.connect(user).mintStable(collateralAmount, govAmount))
                .to.emit(centralVault, "Minted")
                .withArgs(user.address, collateralAmount, govAmount, 150); // Adjust expected stable amount based on price

            // Check balances
            expect(await simStable.balanceOf(user.address)).to.equal(150);
            expect(await collateralToken.balanceOf(centralVault.target)).to.equal(collateralAmount);
        });


        it("Should revert if collateral amount is zero", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);
            await expect(centralVault.connect(user).mintStable(0, 50)).to.be.revertedWith(
                "Collateral must be greater than zero"
            );
        });

        it("Should revert if SimGov amount is zero", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);
            await expect(centralVault.connect(user).mintStable(100, 0)).to.be.revertedWith(
                "SimGov amount must be greater than zero"
            );
        });
    });

    describe("Redeeming", function () {
        it("Should allow users to redeem SimStable tokens", async function () {
            const { centralVault, simStable, simGov, collateralToken, owner, user } = await loadFixture(deployCentralVaultFixture);

            // Mint SimGov tokens to the user using CentralVault
            const govAmount = 50;
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);

            // Mint collateral tokens to the user
            const collateralAmount = 100;
            await collateralToken.connect(owner).mint(user.address, collateralAmount);

            // Approve CentralVault to spend collateral and SimGov tokens
            await collateralToken.connect(user).approve(centralVault.target, collateralAmount);
            await simGov.connect(user).approve(centralVault.target, govAmount);

            // Mint SimStable tokens to the user
            await centralVault.connect(user).mintStable(collateralAmount, govAmount);

            // Redeem SimStable tokens
            const stableAmount = 150;
            const expectedGovMinted = 150;
            await expect(centralVault.connect(user).redeemStable(stableAmount))
                .to.emit(centralVault, "Redeemed")
                .withArgs(user.address, stableAmount, collateralAmount, expectedGovMinted);

            // Check balances
            expect(await simStable.balanceOf(user.address)).to.equal(0);
            expect(await collateralToken.balanceOf(user.address)).to.equal(collateralAmount);
            expect(await simGov.balanceOf(user.address)).to.equal(expectedGovMinted);
        });

        it("Should revert if SimStable amount is zero", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);
            await expect(centralVault.connect(user).redeemStable(0)).to.be.revertedWith(
                "Invalid stable amount"
            );
        });

        it("Should revert if user does not have enough SimStable tokens", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);
            const stableAmount = 100;
            await expect(centralVault.connect(user).redeemStable(stableAmount)).to.be.revertedWith(
                "No SimStable tokens in circulation"
            );
        });

        it("Should revert if SimStable price is zero", async function () {
            const { centralVault, simStablePair, user } = await loadFixture(deployCentralVaultFixture);

            // Set SimStable price to zero in the mock pair
            await simStablePair.setReserves(0, ethers.parseUnits("1", 18), Math.floor(Date.now() / 1000)); // Use current timestamp

            // Attempt to redeem SimStable tokens
            const stableAmount = 100;
            await expect(centralVault.connect(user).redeemStable(stableAmount)).to.be.revertedWith(
                "Reserves cannot be zero"
            );
        });

        it("Should revert if SimGov price is zero", async function () {
            const { centralVault, simGovPair, user } = await loadFixture(deployCentralVaultFixture);

            // Set SimGov price to zero in the mock pair
            await simGovPair.setReserves(0, ethers.parseUnits("1", 18), Math.floor(Date.now() / 1000)); // Use current timestamp

            // Attempt to redeem SimStable tokens
            const stableAmount = 100;
            await expect(centralVault.connect(user).redeemStable(stableAmount)).to.be.revertedWith(
                "Reserves cannot be zero"
            );
        });

        it("Should revert if no SimStable tokens are in circulation", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);

            // Attempt to redeem SimStable tokens without minting any
            const stableAmount = 100;
            await expect(centralVault.connect(user).redeemStable(stableAmount)).to.be.revertedWith(
                "No SimStable tokens in circulation"
            );
        });
    });

    // Add more tests for redeeming, buyback, re-collateralization, and collateral ratio adjustments
});