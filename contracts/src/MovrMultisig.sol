// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MovrMultisig
/// @notice Minimal 2-of-3 multisig for MovrChain administration.
contract MovrMultisig {
    error AlreadyConfirmed();
    error AlreadyExecuted();
    error InvalidSigner();
    error InvalidTarget();
    error NotEnoughConfirmations();
    error NotSelf();
    error NotSigner();
    error TransactionNotFound();

    uint256 public constant threshold = 2;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    address[3] public signers;
    mapping(address => bool) public isSigner;
    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmedBy;

    event Submission(uint256 indexed txId);
    event Confirmation(address indexed signer, uint256 indexed txId);
    event Execution(uint256 indexed txId);
    event ExecutionFailure(uint256 indexed txId);

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }

    modifier transactionExists(uint256 txId) {
        if (txId >= transactions.length) revert TransactionNotFound();
        _;
    }

    constructor(address signer1, address signer2, address signer3) {
        if (
            signer1 == address(0) || signer2 == address(0) || signer3 == address(0) || signer1 == signer2
                || signer1 == signer3 || signer2 == signer3
        ) {
            revert InvalidSigner();
        }

        signers = [signer1, signer2, signer3];
        isSigner[signer1] = true;
        isSigner[signer2] = true;
        isSigner[signer3] = true;
    }

    receive() external payable {}

    function submitTransaction(address to, uint256 value, bytes calldata data)
        external
        onlySigner
        returns (uint256 txId)
    {
        if (to == address(0)) revert InvalidTarget();

        txId = transactions.length;
        transactions.push(Transaction({to: to, value: value, data: data, executed: false, confirmations: 1}));
        confirmedBy[txId][msg.sender] = true;

        emit Submission(txId);
        emit Confirmation(msg.sender, txId);
    }

    function confirmTransaction(uint256 txId) external onlySigner transactionExists(txId) {
        Transaction storage transaction = transactions[txId];
        if (transaction.executed) revert AlreadyExecuted();
        if (confirmedBy[txId][msg.sender]) revert AlreadyConfirmed();

        confirmedBy[txId][msg.sender] = true;
        transaction.confirmations += 1;
        emit Confirmation(msg.sender, txId);
    }

    function executeTransaction(uint256 txId) external onlySigner transactionExists(txId) {
        Transaction storage transaction = transactions[txId];
        if (transaction.executed) revert AlreadyExecuted();
        if (transaction.confirmations < threshold) revert NotEnoughConfirmations();

        transaction.executed = true;
        (bool success,) = transaction.to.call{value: transaction.value}(transaction.data);
        if (success) {
            emit Execution(txId);
        } else {
            transaction.executed = false;
            emit ExecutionFailure(txId);
        }
    }

    /// @notice Rotates a signer only through an approved transaction targeting this contract.
    function replaceSigner(address oldSigner, address newSigner) external {
        if (msg.sender != address(this)) revert NotSelf();
        if (!isSigner[oldSigner] || newSigner == address(0) || isSigner[newSigner]) revert InvalidSigner();

        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == oldSigner) {
                signers[i] = newSigner;
                break;
            }
        }
        isSigner[oldSigner] = false;
        isSigner[newSigner] = true;
    }
}
