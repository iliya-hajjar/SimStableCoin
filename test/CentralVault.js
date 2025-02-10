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

    describe("Buyback", function () {
        it("Should allow users to execute buyback of SimGov tokens", async function () {
            const { centralVault, simGov, collateralToken, owner, user } = await loadFixture(deployCentralVaultFixture);

            // Set collateral ratio above target (e.g., 160%)
            await centralVault.connect(owner).setCollateralRatio(16000); // 160% (scaled by 1e4)

            // Mint collateral to the CentralVault
            const collateralAmount = 1000;
            await collateralToken.connect(owner).mint(centralVault.target, collateralAmount);

            // Mint SimGov tokens to the user
            const govAmount = 100;
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);

            // Approve CentralVault to burn SimGov tokens
            await simGov.connect(user).approve(centralVault.target, govAmount);

            // Execute buyback
            const expectedCollateral = 100
            await expect(centralVault.connect(user).buybackSimGov(govAmount))
                .to.emit(centralVault, "BuybackExecuted")
                .withArgs(user.address, govAmount, expectedCollateral);

            // Check balances
            expect(await simGov.balanceOf(user.address)).to.equal(0);
            expect(await collateralToken.balanceOf(user.address)).to.equal(expectedCollateral);
        });

        it("Should revert if collateral ratio is below target", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);

            // Collateral ratio is initialized to target (150%), so buyback should fail
            await expect(centralVault.connect(user).buybackSimGov(100))
                .to.be.revertedWith("Buyback not allowed: CR below target");
        });

        it("Should revert if SimGov amount is zero", async function () {
            const { centralVault, user, owner } = await loadFixture(deployCentralVaultFixture);
            await centralVault.connect(owner).setCollateralRatio(16000);
            await expect(centralVault.connect(user).buybackSimGov(0))
                .to.be.revertedWith("Invalid SimGov amount");
        });

        it("Should revert if insufficient collateral", async function () {
            const { centralVault, simGov, collateralToken, owner, user } = await loadFixture(deployCentralVaultFixture);

            // Set collateral ratio above target
            await centralVault.connect(owner).setCollateralRatio(16000);

            // Mint SimGov tokens to the user
            const govAmount = 100;
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);

            // Approve CentralVault to burn SimGov tokens
            await simGov.connect(user).approve(centralVault.target, govAmount);

            // Attempt buyback (CentralVault has no collateral)
            await expect(centralVault.connect(user).buybackSimGov(govAmount))
                .to.be.revertedWith("Invalid buyback amount");
        });

        it("Should revert if user has insufficient SimGov balance", async function () {
            const { centralVault, user, owner } = await loadFixture(deployCentralVaultFixture);

            // Set collateral ratio above target
            await centralVault.connect(owner).setCollateralRatio(16000);

            // Attempt buyback without SimGov tokens
            await expect(centralVault.connect(user).buybackSimGov(100))
                .to.be.revertedWith("Invalid buyback amount");
        });
    });

    describe("Re-Collateralization", function () {
        it("Should allow users to re-collateralize the system", async function () {
            const { centralVault, simGov, simStable, collateralToken, owner, user } = await loadFixture(deployCentralVaultFixture);

            // Mint SimGov tokens to the user for valid minting
            const govAmount = ethers.parseUnits("500", 18);
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);

            // Mint collateral tokens to the user
            const collateralAmount = 1000;
            await collateralToken.connect(owner).mint(user.address, collateralAmount);

            // Approve CentralVault to spend collateral and SimGov tokens
            await collateralToken.connect(user).approve(centralVault.target, collateralAmount);
            await simGov.connect(user).approve(centralVault.target, govAmount);

            // Mint SimStable tokens properly
            await centralVault.connect(user).mintStable(collateralAmount, govAmount);

            // Manually set collateral ratio below target to simulate a shortfall
            await centralVault.connect(owner).setCollateralRatio(14000); // 140%

            // Calculate shortfall based on the actual collateral and target
            const totalStableSupply = await simStable.totalSupply();
            const targetCollateral = (totalStableSupply * 15000n) / 10000n; // Target CR = 150%
            const currentCollateral = await collateralToken.balanceOf(centralVault.target);
            const shortfall = targetCollateral > currentCollateral ? targetCollateral - currentCollateral : 0;

            // Mint additional collateral to the user to cover the shortfall
            const collateralToAdd = shortfall;
            await collateralToken.connect(owner).mint(user.address, collateralToAdd);

            // Approve CentralVault to spend the additional collateral
            await collateralToken.connect(user).approve(centralVault.target, collateralToAdd);

            // Execute re-collateralization
            await expect(centralVault.connect(user).reCollateralize(collateralToAdd))
                .to.emit(centralVault, "ReCollateralized")
                .withArgs(user.address, collateralToAdd, collateralToAdd);

            // Check balances and collateral ratio
            expect(await collateralToken.balanceOf(centralVault.target)).to.equal(currentCollateral + collateralToAdd);
            expect(await simGov.balanceOf(user.address)).to.equal(collateralToAdd); // govMinted = collateralToAdd
        });

        it("Should revert if collateral ratio is above target", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);

            // Collateral ratio is initialized to target (150%), so re-collateralization should fail
            await expect(centralVault.connect(user).reCollateralize(100))
                .to.be.revertedWith("Re-collateralization not required");
        });

        it("Should revert if collateral amount is zero", async function () {
            const { centralVault, user, owner } = await loadFixture(deployCentralVaultFixture);

            // Set collateral ratio below target
            await centralVault.connect(owner).setCollateralRatio(14000);

            // Attempt re-collateralization with zero collateral
            await expect(centralVault.connect(user).reCollateralize(0))
                .to.be.revertedWith("Invalid collateral amount");
        });

        it("Should revert if collateral exceeds shortfall", async function () {
            const { centralVault, collateralToken, simGov, simStable, owner, user } = await loadFixture(deployCentralVaultFixture);

            await centralVault.connect(owner).setCollateralRatio(14000); // 140%

            // Mint collateral tokens to the user FIRST
            const stableAmount = ethers.parseUnits("1000", 18);
            await collateralToken.connect(owner).mint(user.address, stableAmount);

            // Mint SimGov tokens to the user
            const govAmount = ethers.parseUnits("500", 18);
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);

            // Approve vault to spend collateral and SimGov
            await collateralToken.connect(user).approve(centralVault.target, stableAmount);
            await simGov.connect(user).approve(centralVault.target, govAmount);

            // Now mint SimStable (user has collateral)
            await centralVault.connect(user).mintStable(stableAmount, govAmount);

            // Calculate shortfall based on the stable supply and the original target CR of 150%
            // targetCollateral = (totalStableSupply * 15000) / 10000.
            const totalStableSupply = await simStable.totalSupply();
            const targetCollateral = totalStableSupply * 15000n / 10000n;
            const currentCollateral = await collateralToken.balanceOf(centralVault.target);
            const shortfall = targetCollateral > currentCollateral ? targetCollateral - currentCollateral : 0n;


            // For this test, we want to simulate an excess deposit:
            // collateralToAdd = shortfall + extra (with extra > 0)
            const extra = ethers.parseUnits("100", 18);
            const collateralToAdd = shortfall + extra;

            // Mint additional collateral to the user (this amount is more than the shortfall)
            await collateralToken.connect(owner).mint(user.address, collateralToAdd);

            // Approve CentralVault to spend the additional collateral from the user using centralVault.address
            await collateralToken.connect(user).approve(centralVault.target, collateralToAdd);

            // Attempt re-collateralization with excess collateral.
            // According to the logic, reCollateralize should revert if the provided collateralAmount exceeds the shortfall.
            await expect(centralVault.connect(user).reCollateralize(collateralToAdd))
                .to.be.revertedWith("Collateral exceeds shortfall");
        });

        it("Should revert if no shortfall exists", async function () {
            const { centralVault, collateralToken, owner, user } = await loadFixture(deployCentralVaultFixture);

            // Set collateral ratio to target (no shortfall)
            await centralVault.connect(owner).setCollateralRatio(15000);

            // Mint collateral to the user
            const collateralAmount = 100;
            await collateralToken.connect(owner).mint(user.address, collateralAmount);

            // Approve CentralVault to spend collateral
            await collateralToken.connect(user).approve(centralVault.target, collateralAmount);

            // Attempt re-collateralization (no shortfall)
            await expect(centralVault.connect(user).reCollateralize(collateralAmount))
                .to.be.revertedWith("Re-collateralization not required");
        });
    });
    // Add more tests for collateral ratio adjustments
});