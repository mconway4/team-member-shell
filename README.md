# Team Member order shell — usability refresh

Static prototype of the shared Order Detail / Track / Refund pattern, restyled for **scan speed and AHT** without remapping data fields.

## Goals

- Keep the same order information agents need today
- Make status, money, and *what I can do next* easier to find
- One shared shell across the three screens

## Run

```bash
python3 -m http.server 5180
```

Open http://localhost:5180

## Views

Use the **Order detail · Track · Refund** switcher. Fixture = Order `451990612` from current production screenshots.
