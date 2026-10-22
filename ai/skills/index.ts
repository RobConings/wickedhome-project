/**
 * Every skill of the assistant, registered once at startup (imported by src/api/app.ts). Adding a skill:
 * create ai/skills/<skill>/{tools.ts,guide.md} and add one line here. See ai/docs/ADDING-TOOLS.md.
 */
import "./alarm/tools";
import "./automations/tools";
import "./calendar/tools";
import "./contacts/tools";
import "./devices/tools";
import "./documents/tools";
import "./energy/tools";
import "./expenses/tools";
// Not a tool: the language model also reads bill mails for the mail scan (src/api/integrations/bill-readers.ts).
import "./expenses/bill-reader";
import "./floorplan/tools";
import "./household/tools";
import "./income/tools";
import "./integrations/tools";
import "./inventory/tools";
import "./mail/tools";
import "./money/tools";
import "./places/tools";
import "./planner/tools";
import "./projects/tools";
import "./recipes/tools";
import "./settings/tools";
import "./shopping/tools";
import "./shops/tools";
import "./tasks/tools";
import "./waste/tools";
import "./weather/tools";
import "./web/tools";
