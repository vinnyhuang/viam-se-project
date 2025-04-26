# Scavenger Hunt Game

A web-based scavenger hunt game that uses computer vision to detect objects through a webcam.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with your Viam credentials:
   ```
   VITE_VIAM_API_KEY=your_api_key
   VITE_VIAM_API_KEY_ID=your_api_key_id
   VITE_VIAM_ADDRESS=your_viam_address
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## Object Lists

The game uses two object lists:
- `household_objects.txt` - Common household items
- `scavenger_custom_objects.txt` - Custom objects for the game

You can add more objects to `scavenger_custom_objects.txt` to expand the game's vocabulary.

## VIAM Components / Services

Requires you have configured:
- `cam` Camera Component
- `myPeopleDetector` Vision / MLModel service
  - Should use `EfficientDet-COCO`
- `scavengerCustomerDetector` Vision / MLModel service
  - Should use MLModel trained on custom data matching the objects in `scavenger_custom_objects.txt`
