from viam.utils import SensorReading, ValueTypes, struct_to_dict
from viam.services.vision import VisionClient
from viam.robot.client import RobotClient
import os

from typing import (Any, ClassVar, Dict, Final, List, Mapping, Optional,
                    Sequence)

from typing_extensions import Self
from viam.components.sensor import *
from viam.proto.app.robot import ComponentConfig
from viam.proto.common import Geometry, ResourceName
from viam.resource.base import ResourceBase
from viam.resource.easy_resource import EasyResource
from viam.resource.types import Model, ModelFamily


class PeopleSensor(Sensor, EasyResource):
    # To enable debug-level logging, either run viam-server with the --debug option,
    # or configure your resource/machine to display debug logs.
    MODEL: ClassVar[Model] = Model(
        ModelFamily("vinnyhuang", "person-detector"), "people-sensor"
    )

    @classmethod
    def new(
        cls, config: ComponentConfig, dependencies: Mapping[ResourceName, ResourceBase]
    ) -> Self:
        """This method creates a new instance of this Sensor component.
        The default implementation sets the name from the `config` parameter and then calls `reconfigure`.

        Args:
            config (ComponentConfig): The configuration for this resource
            dependencies (Mapping[ResourceName, ResourceBase]): The dependencies (both implicit and explicit)

        Returns:
            Self: The resource
        """
        return super().new(config, dependencies)

    @classmethod
    def validate_config(cls, config: ComponentConfig) -> Sequence[str]:
        fields = config.attributes.fields
        if not "vision_service_name" in fields:
            raise Exception("Missing vision_service_name attribute.")
        elif not fields["vision_service_name"].HasField("string_value"):
            raise Exception("vision_service_name must be a string.")

        if not "camera_name" in fields:
            raise Exception("Missing camera_name attribute.")
        elif not fields["camera_name"].HasField("string_value"):
            raise Exception("camera_name must be a string.")
        return []

    def reconfigure(
        self, config: ComponentConfig, dependencies: Mapping[ResourceName, ResourceBase]
    ):
        """This method allows you to dynamically update your service when it receives a new `config` object.

        Args:
            config (ComponentConfig): The new configuration
            dependencies (Mapping[ResourceName, ResourceBase]): Any dependencies (both implicit and explicit)
        """
        attrs = struct_to_dict(config.attributes)
        self.vision_service_name = str(attrs.get("vision_service_name"))
        self.camera_name = str(attrs.get("camera_name"))
        return super().reconfigure(config, dependencies)

    async def get_readings(
        self,
        *,
        extra: Optional[Mapping[str, Any]] = None,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Mapping[str, SensorReading]:
        api_key = os.getenv('VIAM_API_KEY')
        api_key_id = os.getenv('VIAM_API_KEY_ID')
        address = os.getenv('VIAM_ADDRESS')
        
        opts = RobotClient.Options.with_api_key(
            api_key=api_key,
            api_key_id=api_key_id
        )
        robot = await RobotClient.at_address(address, opts)
        try:
            vision = VisionClient.from_robot(robot, self.vision_service_name)
            detections = await vision.get_detections_from_camera(self.camera_name)

            for d in detections:
                if d.confidence > 0.8 and d.class_name.lower() == "person":
                    return {"person_detected": 1}
            
            return {"person_detected": 0}
        finally:
            await robot.close()

    async def do_command(
        self,
        command: Mapping[str, ValueTypes],
        *,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Mapping[str, ValueTypes]:
        self.logger.error("`do_command` is not implemented")
        raise NotImplementedError()

    async def get_geometries(
        self, *, extra: Optional[Dict[str, Any]] = None, timeout: Optional[float] = None
    ) -> List[Geometry]:
        self.logger.error("`get_geometries` is not implemented")
        raise NotImplementedError()

