import { FsaVault } from '../src/core/vault.js';
import { demoFiles } from '../src/core/demo.js';
import { loadCampaign, buildIndex, topFolders, newNotePath } from '../src/core/campaign.js';
import { detectMapping } from '../src/core/schema.js';
import { Working } from '../src/core/working.js';
import { buildReview, applyPush, defaultDecisions } from '../src/core/push.js';
import { patchFrontmatter } from '../src/core/frontmatter.js';
import { scanVault, buildReport } from '../src/core/inspector.js';
window.T = { FsaVault, demoFiles, loadCampaign, buildIndex, topFolders, newNotePath, detectMapping, Working, buildReview, applyPush, defaultDecisions, patchFrontmatter, scanVault, buildReport };
