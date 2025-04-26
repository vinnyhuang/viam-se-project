import asyncio
from viam.module.module import Module
try:
    from models.people_sensor import PeopleSensor
except ModuleNotFoundError:
    # when running as local module with run.sh
    from .models.people_sensor import PeopleSensor


if __name__ == '__main__':
    asyncio.run(Module.run_from_registry())
