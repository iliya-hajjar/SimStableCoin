const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers , upgrades} = require("hardhat");


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

        // Deploy CentralVault through proxy
        const CentralVault = await ethers.getContractFactory("CentralVault");
        const centralVaultProxy = await upgrades.deployProxy(
            CentralVault,
            [
                owner.address,       // initialOwner
                simStable.target,    // _simStable
                simGov.target,       // _simGov
                collateralToken.target,  // _collateralToken
                simStablePair.target,    // _simStablePair
                simGovPair.target        // _simGovPair
            ],
            { initializer: "initialize" }
        );

        // Wait for deployment
        await centralVaultProxy.waitForDeployment();
        const centralVaultAddress = await centralVaultProxy.getAddress();

        // Set vault addresses in SimGov and SimStable
        await simGov.connect(owner).setVault(centralVaultAddress);
        await simStable.connect(owner).setVault(centralVaultAddress);

        return { centralVault: centralVaultProxy, simGov, simStable, collateralToken, simStablePair, simGovPair, owner, user };
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

            // Approve CentralVault to spend the additional collateral from the user using centralVault.target
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
    describe("Collateral Ratio Adjustments", function () {
        it("Should increase CR when SimStable price is below peg", async function () {
            const { centralVault, simStablePair, owner } = await loadFixture(deployCentralVaultFixture);

            // Set SimStable price to 0.8 USD (below 1 USD peg)
            await simStablePair.setReserves(
                ethers.parseUnits("1000000", 18), // SimStable reserves
                ethers.parseUnits("800000", 18),  // Collateral reserves (0.8 ratio)
                Math.floor(Date.now() / 1000)
            );

            const initialCR = await centralVault.collateralRatio();
            await centralVault.connect(owner).adjustCollateralRatio();
            const newCR = await centralVault.collateralRatio();

            // Deviation = 1e18 - 0.8e18 = 0.2e18
            // Adjustment = (adjustmentCoefficient * deviation) / 1e18 = (100 * 0.2e18)/1e18 = 20
            expect(newCR).to.equal(initialCR + 20n); // CR increases
        });

        it("Should decrease CR when SimStable price is above peg", async function () {
            const { centralVault, simStablePair, owner } = await loadFixture(deployCentralVaultFixture);

            // Set SimStable price to 1.2 USD (above peg)
            await simStablePair.setReserves(
                ethers.parseUnits("1000000", 18), // SimStable
                ethers.parseUnits("1200000", 18), // Collateral (1.2 ratio)
                Math.floor(Date.now() / 1000)
            );

            const initialCR = await centralVault.collateralRatio();
            await centralVault.connect(owner).adjustCollateralRatio();
            const newCR = await centralVault.collateralRatio();

            // Deviation = 1e18 - 1.2e18 = -0.2e18
            // Adjustment = (100 * -0.2e18)/1e18 = -20
            expect(newCR).to.equal(initialCR - 20n); // CR decreases
        });

        it("Should not go below minCollateralRatio", async function () {
            const { centralVault, simStablePair, owner } = await loadFixture(deployCentralVaultFixture);

            // Set price to 1.5 USD (ABOVE PEG to trigger CR decrease)
            await simStablePair.setReserves(
                ethers.parseUnits("1", 18), // SimStable reserves
                ethers.parseUnits("1.5", 18), // Collateral reserves (price = 1.5 USD)
                Math.floor(Date.now() / 1000)
            );

            // Set CR to minimum + 1 (11001) to test boundary
            await centralVault.connect(owner).setCollateralRatio(11001);

            // Trigger adjustment (should try to decrease CR)
            await centralVault.connect(owner).adjustCollateralRatio();
            const newCR = await centralVault.collateralRatio();

            // Verify it clamps to minCollateralRatio (11000)
            expect(newCR).to.equal(11000);
        });

        it("Should not exceed maxCollateralRatio", async function () {
            const { centralVault, simStablePair, owner } = await loadFixture(deployCentralVaultFixture);

            // Set price to 0.5 USD (BELOW PEG to trigger CR increase)
            await simStablePair.setReserves(
                ethers.parseUnits("1", 18), // SimStable reserves
                ethers.parseUnits("0.5", 18), // Collateral reserves (price = 0.5 USD)
                Math.floor(Date.now() / 1000)
            );

            // Set CR to max - 1 (19999) to test boundary
            await centralVault.connect(owner).setCollateralRatio(19999);

            // Trigger adjustment (should try to increase CR)
            await centralVault.connect(owner).adjustCollateralRatio();
            const newCR = await centralVault.collateralRatio();

            // Verify it clamps to maxCollateralRatio (20000)
            expect(newCR).to.equal(20000);
        });

        it("Should not change CR when price is exactly at peg", async function () {
            const { centralVault, simStablePair, owner } = await loadFixture(deployCentralVaultFixture);

            // Set price exactly at 1 USD
            await simStablePair.setReserves(
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 18),
                Math.floor(Date.now() / 1000)
            );

            const initialCR = await centralVault.collateralRatio();
            await centralVault.connect(owner).adjustCollateralRatio();
            const newCR = await centralVault.collateralRatio();

            expect(newCR).to.equal(initialCR); // No adjustment
        });

        it("Should revert if non-owner tries to set CR manually", async function () {
            const { centralVault, user } = await loadFixture(deployCentralVaultFixture);
            await expect(centralVault.connect(user).setCollateralRatio(15000))
                .to.be.revertedWithCustomError(centralVault, "OwnableUnauthorizedAccount");
        });

        it("Should auto-adjust CR on SimStable transfers", async function () {
            const { centralVault, simStable, simGov, collateralToken, owner, user, simStablePair, simGovPair } = await loadFixture(deployCentralVaultFixture);

            // 1. Set up prices (SimStable = 0.8, SimGov = 2.0)
            await simStablePair.setReserves(
                ethers.parseUnits("1000", 18), // SimStable
                ethers.parseUnits("800", 18),  // Collateral (0.8 ratio)
                Math.floor(Date.now() / 1000)
            );
            await simGovPair.setReserves(
                ethers.parseUnits("1", 18),    // SimGov
                ethers.parseUnits("2", 18),    // Collateral (2.0 ratio)
                Math.floor(Date.now() / 1000)
            );

            // 2. Mint SimStable through vault
            const collateralAmount = ethers.parseUnits("1000", 18);
            const govAmount = ethers.parseUnits("500", 18);
            await collateralToken.connect(owner).mint(user.address, collateralAmount);
            await centralVault.connect(owner).mintSimGov(user.address, govAmount);
            await collateralToken.connect(user).approve(centralVault.target, collateralAmount);
            await simGov.connect(user).approve(centralVault.target, govAmount);
            await centralVault.connect(user).mintStable(collateralAmount, govAmount);

            // 3. Verify initial state
            const initialCR = await centralVault.collateralRatio();
            expect(initialCR).to.equal(15000); // Ensure initial CR is correct

            // 4. Transfer tokens to trigger adjustment
            await simStable.connect(user).transfer(owner.address, 100);

            // 5. Verify CR adjustment
            const newCR = await centralVault.collateralRatio();
            expect(newCR).to.equal(15020); // 15000 + (100 * 0.2e18 / 1e18) = 15020
        });
    });
});