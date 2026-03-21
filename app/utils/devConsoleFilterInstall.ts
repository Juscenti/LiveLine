// Import this module first from app/_layout so filters apply before other imports run side effects.
import { installDevConsoleNetworkFilter } from './devConsoleFilter';

installDevConsoleNetworkFilter();
