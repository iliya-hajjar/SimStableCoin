const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CentralVault - getTokenPrice", function () {
    let centralVault, simStable, simGov, collateralToken, uniswapPairMock;
    let admin, user;

    beforeEach(async function () {
        [admin, user] = await ethers.getSigners();

        // Deploy SimStable and SimGov mocks
        const SimStable = await ethers.getContractFactory("SimStable");
        simStable = await SimStable.deploy();

        const SimGov = await ethers.getContractFactory("SimGov");
        simGov = await SimGov.deploy();

        // Deploy CollateralToken mock
        const CollateralToken = await ethers.getContractFactory("MockERC20");
        collateralToken = await CollateralToken.deploy("CollateralToken", "COLL");

        // Deploy Uniswap Pair mock
        const UniswapPairMock = await ethers.getContractFactory("MockUniswapV2Pair");
        uniswapPairMock = await UniswapPairMock.deploy();

        // Deploy CentralVault
        const CentralVault = await ethers.getContractFactory("CentralVault");
        centralVault = await CentralVault.deploy(
            simStable.target,
            simGov.target,
            collateralToken.target,
            uniswapPairMock.target,
            uniswapPairMock.target
        );
    });

    it("should return the correct token price when token0 matches", async function () {
        // Using values within uint112 range for reserves
        const reserve0 = BigInt("1000"); // SimStable
        const reserve1 = BigInt("2000"); // Collateral

        // Set reserves in Uniswap pair mock (using uint112 values)
        await uniswapPairMock.setReserves(reserve0, reserve1);

        // Set token0 and token1 addresses in Uniswap pair mock
        await uniswapPairMock.setToken0(simStable.target);
        await uniswapPairMock.setToken1(collateralToken.target);

        // Call getTokenPrice and validate result
        const price = await centralVault.getTokenPrice(uniswapPairMock.target, simStable.target);
        const expectedPrice = BigInt("2000000000000000000"); // Expected price 2000 / 1000 = 2.0
        expect(price).to.equal(expectedPrice);
    });

    it("should return the correct token price when token1 matches", async function () {
        // Using values within uint112 range for reserves
        const reserve0 = BigInt("1500"); // Collateral
        const reserve1 = BigInt("750");  // SimGov

        // Set reserves in Uniswap pair mock (using uint112 values)
        await uniswapPairMock.setReserves(reserve0, reserve1);

        // Set token0 and token1 addresses in Uniswap pair mock
        await uniswapPairMock.setToken0(collateralToken.target);
        await uniswapPairMock.setToken1(simGov.target);

        // Call getTokenPrice and validate result
        const price = await centralVault.getTokenPrice(uniswapPairMock.target, simGov.target);
        const expectedPrice = BigInt("2000000000000000000"); // Expected price 1500 / 750 = 2.0
        expect(price).to.equal(expectedPrice);
    });

    it("should revert if the token is not in the pair", async function () {
        // Attempt to call getTokenPrice with a non-existent token in the pair
        await expect(centralVault.getTokenPrice(uniswapPairMock.target, user.address))
            .to.be.revertedWith("Token not in pair");
    });
});


describe("CentralVault - updatePrices", function () {
    let centralVault, simStable, simGov, collateralToken, simStablePairMock, simGovPairMock;
    let admin;

    beforeEach(async function () {
        [admin] = await ethers.getSigners();

        // Deploy SimStable and SimGov mocks
        const SimStable = await ethers.getContractFactory("SimStable");
        simStable = await SimStable.deploy();

        const SimGov = await ethers.getContractFactory("SimGov");
        simGov = await SimGov.deploy();

        // Deploy CollateralToken mock
        const CollateralToken = await ethers.getContractFactory("MockERC20");
        collateralToken = await CollateralToken.deploy("CollateralToken", "COLL");

        // Deploy Uniswap Pair mocks
        const UniswapPairMock = await ethers.getContractFactory("MockUniswapV2Pair");

        simStablePairMock = await UniswapPairMock.deploy();

        simGovPairMock = await UniswapPairMock.deploy();

        // Deploy CentralVault
        const CentralVault = await ethers.getContractFactory("CentralVault");
        centralVault = await CentralVault.deploy(
            simStable.target,
            simGov.target,
            collateralToken.target,
            simStablePairMock.target,
            simGovPairMock.target
        );
    });

    it("should update prices and emit PricesUpdated event", async function () {
        // Mock reserves and tokens for SimStable pair
        const reserveStable0 = ethers.parseUnits("1000", 18); // SimStable
        const reserveStable1 = ethers.parseUnits("2000", 18); // Collateral

        await simStablePairMock.setReserves(reserveStable0, reserveStable1);
        await simStablePairMock.setToken0(simStable.target);
        await simStablePairMock.setToken1(collateralToken.target);

        // Mock reserves and tokens for SimGov pair
        const reserveGov0 = ethers.parseUnits("1500", 18); // Collateral
        const reserveGov1 = ethers.parseUnits("750", 18);  // SimGov

        await simGovPairMock.setReserves(reserveGov0, reserveGov1);
        await simGovPairMock.setToken0(collateralToken.target);
        await simGovPairMock.setToken1(simGov.target);

        // Call updatePrices
        const tx = await centralVault.updatePrices();

        // Calculate expected prices
        const expectedSimStablePrice = (reserveStable1 * 10n ** 18n) / reserveStable0;
        const expectedSimGovPrice = (reserveGov0 * 10n ** 18n) / reserveGov1;

        // Verify the PricesUpdated event
        await expect(tx)
            .to.emit(centralVault, "PricesUpdated")
            .withArgs(expectedSimStablePrice, expectedSimGovPrice);
    });
});
