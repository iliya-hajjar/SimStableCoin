// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CentralVault.sol";

contract SimStable is ERC20, Ownable {
    address public vault;

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        super._update(from, to, value); // Call parent implementation first

        // Only trigger if vault is set and this isn't a mint/burn operation
        if (vault != address(0) && from != address(0) && to != address(0)) {
            CentralVault(vault).onSimStableTransfer();
        }
    }

    // Events
    event VaultSet(address indexed vault);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    /**
     * @dev Constructor that initializes the ERC20 token and sets the owner.
     * @param initialOwner The address of the initial owner.
     */
    constructor(address initialOwner) ERC20("SimStable", "SIMS") Ownable(initialOwner) {}

    /**
     * @dev Sets the vault address. Can only be called by the owner.
     * @param _vault The address of the vault contract.
     */
    function setVault(address _vault) external onlyOwner {
        require(vault == address(0), "Vault already set");
        vault = _vault;
        emit VaultSet(_vault);
    }

    /**
     * @dev Mints new tokens. Can only be called by the vault.
     * @param to The address to mint tokens to.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == vault, "Only the vault can mint");
        require(amount > 0, "Amount must be greater than zero");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev Burns tokens. Can only be called by the vault.
     * @param from The address to burn tokens from.
     * @param amount The amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external {
        require(msg.sender == vault, "Only the vault can burn");
        require(amount > 0, "Amount must be greater than zero");
        _burn(from, amount);
        emit TokensBurned(from, amount);
    }
}