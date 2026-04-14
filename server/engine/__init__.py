from .bos import detect as bos_detect
from .fvg import detect as fvg_detect
from .orderblocks import detect as orderblocks_detect
from .liquidity import detect as liquidity_detect
from .gann import detect as gann_detect

# Maps route names to their detection functions.
# Add a new entry here to expose a new /api/analysis/{component} endpoint.
COMPONENTS = {
    "bos": bos_detect,
    "fvg": fvg_detect,
    "orderblocks": orderblocks_detect,
    "liquidity": liquidity_detect,
    "gann": gann_detect,
}
