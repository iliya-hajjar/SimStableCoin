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
        collateralToken = await CollateralToken.deploy("CollateralToken", "COLL", 18);

        // Deploy Uniswap Pair mock
        const UniswapPairMock = await ethers.getContractFactory("MockUniswapV2Pair");
        uniswapPairMock = await UniswapPairMock.deploy();

        // Deploy CentralVault
        const CentralVault = await ethers.getContractFactory("CentralVault");
        centralVault = await CentralVault.deploy(
            simStable.address,
            simGov.address,
            collateralToken.address,
            uniswapPairMock.address,
            uniswapPairMock.address
        );
    });

    it("should return the correct token price when token0 matches", async function () {
        // Using values within uint112 range for reserves
        const reserve0 = ethers.BigNumber.from("1000"); // SimStable
        const reserve1 = ethers.BigNumber.from("2000"); // Collateral

        // Set reserves in Uniswap pair mock (using uint112 values)
        await uniswapPairMock.setReserves(reserve0, reserve1);

        // Set token0 and token1 addresses in Uniswap pair mock
        await uniswapPairMock.setToken0(simStable.address);
        await uniswapPairMock.setToken1(collateralToken.address);

        // Call getTokenPrice and validate result
        const price = await centralVault.getTokenPrice(uniswapPairMock.address, simStable.address);
        const expectedPrice = ethers.utils.parseUnits("2", 18); // Expected price 2000 / 1000 = 2.0
        expect(price).to.equal(expectedPrice);
    });

    it("should return the correct token price when token1 matches", async function () {
        // Using values within uint112 range for reserves
        const reserve0 = ethers.BigNumber.from("1500"); // Collateral
        const reserve1 = ethers.BigNumber.from("750");  // SimGov

        // Set reserves in Uniswap pair mock (using uint112 values)
        await uniswapPairMock.setReserves(reserve0, reserve1);

        // Set token0 and token1 addresses in Uniswap pair mock
        await uniswapPairMock.setToken0(collateralToken.address);
        await uniswapPairMock.setToken1(simGov.address);

        // Call getTokenPrice and validate result
        const price = await centralVault.getTokenPrice(uniswapPairMock.address, simGov.address);
        const expectedPrice = ethers.utils.parseUnits("2", 18); // Expected price 1500 / 750 = 2.0
        expect(price).to.equal(expectedPrice);
    });

    it("should revert if the token is not in the pair", async function () {
        // Attempt to call getTokenPrice with a non-existent token in the pair
        await expect(centralVault.getTokenPrice(uniswapPairMock.address, user.address))
            .to.be.revertedWith("Token not in pair");
    });
});
