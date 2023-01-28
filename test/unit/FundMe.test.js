const {assert, expect} = require("chai")
const {deployments, ethers, getNamedAccounts, network} = require("hardhat")
const {developmentChains} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) ? describe.skip :
describe("FundMe", async function () {
    let fundMe
    let deployer
    let mockV3Aggregator
    const sendValue = ethers.utils.parseEther("1") // 1 MATIC
    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        fundMe = await ethers.getContract("FundMe", deployer)
        mockV3Aggregator = await ethers.getContract(
            "MockV3Aggregator",
            deployer
        )
    })

    describe("constructor", async function () {
        it("sets the aggregator addresses correctly", async function () {
            const response = await fundMe.priceFeed()
            assert.equal(response, mockV3Aggregator.address)
        })
    })

    describe("fund", async function () {
        it("fails if you don't send enough MATIC", async function () {
            await expect(fundMe.fund()).to.be.revertedWith(
                "You need to spend more MATIC!"
            )
        })
        it("updated the amount funded data structure", async function () {
            await fundMe.fund({value: sendValue})
            const response = await fundMe.addressToAmountFunded(deployer)
            assert.equal(response.toString(), sendValue.toString())
        })
        it("adds funder to array of funders", async function () {
            await fundMe.fund({value: sendValue})
            const response = await fundMe.funders(0)
            assert.equal(response, deployer)
        })
    })

    describe("withdraw", async function () {
        beforeEach(async function () {
            await fundMe.fund({value: sendValue})
        })
        it("withdraw MATIC from a single funder", async function () {
            // Arrange
            const startingContractBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const startingDeployerBalance = await fundMe.provider.getBalance(
                deployer
            )
            // Act
            const txResponse = await fundMe.withdraw()
            const txReceipt = await txResponse.wait(1)
            const {gasUsed, effectiveGasPrice} = txReceipt
            const gasCost = gasUsed.mul(effectiveGasPrice)

            const endingContractBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const endingDeployerBalance = await fundMe.provider.getBalance(
                deployer
            )
            // Assert
            assert.equal(endingContractBalance, 0)
            assert.equal(
                startingContractBalance.add(startingDeployerBalance).toString(),
                endingDeployerBalance.add(gasCost).toString()
            )
        })
        it("allows us to withdraw with multiple funders", async function () {
            // Arrange
            const accounts = await ethers.getSigners()
            for (let i = 1; i < 6; i++) {
                const connectedContract = await fundMe.connect(accounts[i])
                await connectedContract.fund({value: sendValue})
            }
            const startingContractBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const startingDeployerBalance = await fundMe.provider.getBalance(
                deployer
            )

            // Act
            const txResponse = await fundMe.withdraw()
            const txReceipt = await txResponse.wait(1)
            const {gasUsed, effectiveGasPrice} = txReceipt
            const gasCost = gasUsed.mul(effectiveGasPrice)
            const endingContractBalance = await fundMe.provider.getBalance(
                fundMe.address
            )
            const endingDeployerBalance = await fundMe.provider.getBalance(
                deployer
            )

            // Assert
            assert.equal(endingContractBalance, 0)
            assert.equal(
                startingContractBalance.add(startingDeployerBalance).toString(),
                endingDeployerBalance.add(gasCost).toString()
            )

            await expect(fundMe.funders(0)).to.be.reverted
            for (i = 1; i < 6; i++) {
                assert.equal(
                    await fundMe.addressToAmountFunded(accounts[i].address),
                    0
                )
            }
        })

        it("only the owner to withdraw", async function () {
            const accounts = await ethers.getSigners()
            const attacker = accounts[2]
            const attackerConnectedContract = await fundMe.connect(attacker)
            await expect(
                attackerConnectedContract.withdraw()
            ).to.be.revertedWithCustomError(
                attackerConnectedContract,
                "FundMe__NotOwner"
            )
        })
    })
})
