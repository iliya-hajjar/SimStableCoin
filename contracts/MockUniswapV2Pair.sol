// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockUniswapV2Pair {
    uint112 public reserve0;
    uint112 public reserve1;
    uint32 public blockTimestampLast;

    address private _token0;
    address private _token1;

    constructor(address token0_, address token1_) {
        _token0 = token0_;
        _token1 = token1_;

        reserve0 = uint112(1e18);
        reserve1 = uint112(1e18);
        blockTimestampLast = uint32(block.timestamp);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function token0() external view returns (address) {
        return _token0;
    }

    function token1() external view returns (address) {
        return _token1;
    }

    // Add a function to set reserves for testing
    function setReserves(uint112 reserve0_, uint112 reserve1_, uint32 blockTimestampLast_) external {
        reserve0 = reserve0_;
        reserve1 = reserve1_;
        blockTimestampLast = blockTimestampLast_;
    }
}