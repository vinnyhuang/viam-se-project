import asyncio
import os
import yagmail

from viam.robot.client import RobotClient
from viam.components.camera import Camera
from viam.rpc.dial import Credentials, DialOptions
from viam.services.vision import VisionClient, Detection
from viam.media.utils.pil import viam_to_pil_image

# Set environment variables. You can get them from your machine's CONNECT tab
api_key = os.getenv('VIAM_API_KEY')
api_key_id = os.getenv('VIAM_API_KEY_ID')
address = os.getenv('VIAM_ADDRESS')


async def connect():
    opts = RobotClient.Options.with_api_key(
      api_key=api_key,
      api_key_id=api_key_id
    )
    return await RobotClient.at_address(address, opts)


async def main():
    machine = await connect()
    # make sure that your detector name in the app matches "myPeopleDetector"
    myPeopleDetector = VisionClient.from_robot(machine, "myPeopleDetector")
    # make sure that your camera name in the app matches "my-camera"
    my_camera = Camera.from_robot(robot=machine, name="cam")

    while True:
        img = await my_camera.get_image(mime_type="image/jpeg")
        detections = await myPeopleDetector.get_detections(img)

        found = False
        for d in detections:
            if d.confidence > 0.8 and d.class_name.lower() == "person":
                print("This is a person!")
                found = True
        if found:
            print("sending a message")
            # Convert to PIL image
            pil_image = viam_to_pil_image(img)
            # Change this path to your own
            pil_image.save('./foundyou.jpeg')
            # Yagmail section
            # Create a yagmail.SMTP instance
            # to initialize the server connection.
            # Replace username and password with actual credentials.
            yag = yagmail.SMTP('vincent.vwh.huang@gmail.com', 'etlwdvoghgpediiv')
            # Specify the message contents
            contents = ['There is someone at your desk - beware',
                        './foundyou.jpeg']
            # Add phone number and gateway address
            # found in the SMS gateway step
            yag.send('626-353-7282@tmomail.net', 'subject', contents)

            # If the machine detects a person and sends a text, we don't need
            # it to keep sending us more texts so we sleep it for 60
            # seconds before looking for a person again
            await asyncio.sleep(60)
        else:
            print("There's nobody here, don't send a message")
            await asyncio.sleep(10)
    await asyncio.sleep(5)
    await machine.close()

if __name__ == '__main__':
    asyncio.run(main())