|                   | Alias             | Description                       |
| ----------------- | ----------------- | --------------------------------- |
| **COMBINED:**     |                   |                                   |
| check             |                   | Runs all the checks               |
| check:static      |                   | Runs biome, types and unused-code |
| check:style       | check:biome       | Runs all biome checks             |
| **INDIVIDUAL:**   |                   |                                   |
| check:types       | check:tsc         | type checking                     |
| check:unused-code | check:knip        | Checks for unused code            |
| check:tests       | check:vitest      | Runs unit tests                   |
| check:e2e         | check:playwright  | End to end tests                  |
| check:lint        |                   | Runs biome linting                |
| check:format      |                   | Runs biome formatting             |
| check:imports     |                   | Runs biome import organizing      |
