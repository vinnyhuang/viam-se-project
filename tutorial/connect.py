import asyncio
import os

from viam.robot.client import RobotClient
from viam.rpc.dial import Credentials, DialOptions


async def connect():
    api_key = os.getenv('VIAM_API_KEY')
    api_key_id = os.getenv('VIAM_API_KEY_ID')
    address = os.getenv('VIAM_ADDRESS')

    opts = RobotClient.Options.with_api_key(
        api_key=api_key,
        api_key_id=api_key_id
    )
    return await RobotClient.at_address(address, opts)

async def main():
    machine = await connect()

    print('Resources:')
    print(machine.resource_names)
    
    # Don't forget to close the machine when you're done!
    await machine.close()

if __name__ == '__main__':
    asyncio.run(main())
