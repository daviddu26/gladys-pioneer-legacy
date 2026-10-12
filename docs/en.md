# Pioneer Legacy

This integration drives **older Pioneer AV receivers** from Gladys (about
2009 to 2015: VSX-5xx to VSX-11xx, SC, SC-LX, and the Elite models of the same
years). They use the legacy Pioneer IP control protocol on **port 8102** (or
23 on some models). Recent Pioneers (2016 and later) speak the Onkyo
protocol: use the Onkyo integration for them.

Everything stays **local**: Gladys talks to the receiver directly on your
network, no account, no cloud.

## Before you start

1. Connect the receiver to the network.
2. Turn on **Network Standby** in the receiver's menu. Without it, the
   receiver drops the network in standby and Gladys cannot switch it on.
3. Preferably give it a **fixed IP** (DHCP reservation).

## Adding a receiver

1. Open the **Discovery** tab and click **Scan**. Gladys looks for the Pioneer
   receivers on your network (UPnP), checks they answer the protocol, and
   detects what each one can do.
2. Add the receivers found. A model with a **zone 2** or a **zone 3** shows up
   with one device per zone.

Your receiver does not show up? It may sit on another network (VLAN), or its
UPnP is off. Type its IP address in **Receiver addresses** (several separated
by commas), save, then scan again. The **Check an IP address** button tells
at once whether an address is a supported receiver.

Even when added by its IP, a receiver keeps its identity if its address
changes: it is recognized by its UPnP id when it has one.

## Configuration

- **Receiver addresses**: only for receivers the scan does not find.
- **Maximum volume (dB)**: Gladys never raises the volume above it, whatever a
  slider, a button or a scene asks. 0 dB by default.
- **Input names**: most models cannot report their input names. Rename them
  as `code=name` pairs, e.g. `25=Apple TV, 05=TV`. Models that can report
  their names show them on their own.

## What you get

For every zone:

- **Power** (on / standby)
- **Volume** in dB, **Volume up** and **Volume down** (1 dB steps), **Mute**
- **Input**: the list of inputs

For the main zone, also:

- **Listening mode**: the mode groups of the remote (Auto surround,
  Auto/Direct, Stereo, Standard, Advanced). A group recalls its last used
  mode; sent again less than 2 seconds later, it moves to the next mode, like
  the remote.
- **Current listening mode** (text), on the models that can report it.

Changes made with the remote or the front panel show up in Gladys at once: the
receiver reports them on its own.

## Configuration buttons

- **Check an IP address**: model, port and detected features.
- **Test the connections**: the state of every receiver added.
- **Send a command**: any command of the Pioneer protocol, with the receiver's
  answer. Examples: `?P` (power), `?V` (volume), `25FN` (input 25), `0112SR`
  (EXTENDED STEREO directly, on the models that accept it).

## Scenes

The **Send a Pioneer command** action sends a raw command to the chosen
receiver. The receiver's answer is available to the next actions.

## Commands used

The codes come from Pioneer's official "AVR IP & RS-232" command sheets.

| Function         | Main zone       | Zone 2          | Zone 3          |
| ---------------- | --------------- | --------------- | --------------- |
| Power on / off   | `PO` / `PF`     | `APO` / `APF`   | `BPO` / `BPF`   |
| Power state      | `?P` → `PWRx`   | `?AP` → `APRx`  | `?BP` → `BPRx`  |
| Volume up / down | `VU` / `VD`     | `ZU` / `ZD`     | `YU` / `YD`     |
| Volume state     | `?V` → `VOLxxx` | `?ZV` → `ZVxx`  | `?YV` → `YVxx`  |
| Mute on / off    | `MO` / `MF`     | `Z2MO` / `Z2MF` | `Z3MO` / `Z3MF` |
| Select an input  | `xxFN`          | `xxZS`          | `xxZT`          |
| Input state      | `?F` → `FNxx`   | `?ZS` → `Z2Fxx` | `?ZT` → `Z3Fxx` |

An unknown command gets no error, just silence.

## Troubleshooting

| Problem                             | Hint                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| The scan does not find the receiver | Type its IP in **Receiver addresses**.                        |
| "Recent receiver (Onkyo protocol)"  | Use the Onkyo integration.                                    |
| "Unreachable"                       | Network Standby on? Port 8102 reachable across your networks? |
| The volume stops going up           | It reached the **Maximum volume** of the configuration.       |
| The Advanced mode is the wrong one  | It recalls the last Advanced mode: set it once.               |

For more detail, set `LOG_LEVEL=debug`: the logs show every line exchanged
with the receiver.
