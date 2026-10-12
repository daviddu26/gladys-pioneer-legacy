# Pioneer Legacy

This integration drives **older Pioneer AV receivers** from Gladys (about
2010 to 2015: VSX-528, VSX-529, VSX-921, VSX-1021, VSX-824...), which use the
legacy Pioneer IP control protocol on **port 8102**. These models do not speak
the Onkyo protocol (eISCP, port 60128) of recent Pioneers, so the Onkyo
integration cannot see them.

Everything stays **local**: Gladys talks to the receiver directly on your
network, no account, no cloud.

## Before you start

1. Connect the receiver to the network (Ethernet cable).
2. Turn on **Network Standby** in the receiver's menu. Without it, the
   receiver drops the network in standby and Gladys cannot switch it on.
3. Give it a **fixed IP** (DHCP reservation in your router).
4. Check that the machine running Gladys can reach the receiver on port 8102
   (mind firewall rules between VLANs).

## Configuration

- **Receiver IP address**: required.
- **Port**: 8102 by default (a few models use 23).
- **Maximum volume (dB)**: Gladys never raises the volume above it, whatever a
  slider, a button or a scene asks. 0 dB by default.
- **Input names**: the receiver cannot report its input names over the
  network. Rename them as `code=name` pairs, e.g. `25=Apple TV, 05=TV`.

Save, then add the receiver from the **Discovery** tab.

## What you get

- **Power** (on / standby)
- **Volume** in dB, **Volume up** and **Volume down** (1 dB steps), **Mute**
- **Input**: the list of inputs (Pioneer codes, renameable)
- **Listening mode**: _Auto surround_, or _Advanced_, which recalls the last
  mode used in the Advanced group (e.g. EXT.STEREO). The receiver cannot
  report its listening mode: Gladys shows the last mode it asked for.

Changes made with the remote or the front panel show up in Gladys at once: the
receiver reports them on its own.

## Configuration buttons

- **Test the connection**: model, power, volume and current input.
- **Send a command**: any command of the Pioneer protocol, with the receiver's
  answer. Examples: `?P` (power), `?V` (volume), `25FN` (input 25), `0100SR`
  (Advanced group).

## Scenes

The **Send a Pioneer command** action sends a raw command. The receiver's
answer is available to the next actions. Example: sending `0100SR` several
times less than 2 seconds apart cycles through the Advanced modes, like the
remote.

## Commands confirmed on a VSX-528

| Function         | Command   | Answer          |
| ---------------- | --------- | --------------- |
| Power on / off   | `PO`/`PF` | `PWR0` / `PWR2` |
| Volume up / down | `VU`/`VD` | `VOLxxx`        |
| Mute on / off    | `MO`/`MF` | `MUT0` / `MUT1` |
| Select an input  | `xxFN`    | `FNxx`          |
| Auto surround    | `0006SR`  | (none)          |
| Advanced group   | `0100SR`  | (none)          |

An unknown command gets no error, just silence.

## Troubleshooting

| Problem                           | Hint                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| "Receiver unreachable"            | Network Standby on? Right IP? Port 8102 reachable?                    |
| Unreachable as soon as in standby | Turn on Network Standby.                                              |
| The volume stops going up         | It reached the **Maximum volume** of the configuration.               |
| "Wrong" Advanced mode             | `0100SR` recalls the last Advanced mode: set it once with the remote. |

For more detail, set `LOG_LEVEL=debug`: the logs show every line exchanged
with the receiver.
