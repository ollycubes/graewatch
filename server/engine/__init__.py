from .bos import detect as bos_detect
from .fvg import detect as fvg_detect
from .orderblocks import detect as orderblocks_detect
from .liquidity import detect as liquidity_detect
from .zones import detect as zones_detect
from .wyckoff import detect as wyckoff_detect
from .gann import detect as gann_detect
from .confluence import detect as confluence_detect
from .simulate import simulate_candles

COMPONENTS = {
    "bos": bos_detect,
    "fvg": fvg_detect,
    "orderblocks": orderblocks_detect,
    "liquidity": liquidity_detect,
    "zones": zones_detect,
    "wyckoff": wyckoff_detect,
    "gann": gann_detect,
    "confluence": confluence_detect,
}
