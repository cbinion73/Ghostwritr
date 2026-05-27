/**
 * Build bibliography-the-influence-engine.docx
 * Chicago 17th edition — hanging indent, italic titles
 */
import { writeFileSync } from "fs";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ExternalHyperlink,
} from "/Users/chris/Desktop/CODE/GHOSTWRITR/node_modules/docx/dist/index.mjs";

// ── Raw entries (parsed from the HTML) ──────────────────────────────────────
const entries = [
  `Ambrose, Susan A., et al. *How Learning Works: Seven Research-Based Principles for Smart Teaching*. San Francisco: Jossey-Bass, 2010.`,
  `Burke, C. Shawn, et al. "Trust in Leadership: A Multi-Level Review and Integration." *Academy of Management Review* 32, no. 2 (2007): 288–310.`,
  `Cannon-Bowers, Janis A., Eduardo Salas, and Sallie Converse. "Shared Mental Models in Expert Team Decision Making." *Individual and Group Decision Making: Current Issues* (1993): 221–246.`,
  `Center for Creative Leadership. "Corporate Social Responsibility and Sustainable Business." Accessed 2026. https://www.ccl.org/wp-content/uploads/2026/02/corporate-social-responsibility-and-sustainable-business-research-paper-center-for-creative-leadership.pdf.`,
  `Chemers, Martin M. *An Integrative Theory of Leadership*. New York: Lawrence Erlbaum Associates, 1997.`,
  `Collins, David B., and Edwin F. Holton III. "The Effectiveness of Managerial Leadership Development Programs: A Meta-Analysis of Studies from 1982 to 2001." *Human Resource Development Quarterly* 15, no. 2 (2004): 217–248.`,
  `Covey, Stephen M. R. *The Speed of Trust: The One Thing That Changes Everything*. New York: Free Press, 2006.`,
  `Damon, William, et al. "The Psychology of Purpose." *Templeton Foundation*, 2003. https://www.templeton.org/wp-content/uploads/2020/02/Psychology-of-Purpose.pdf.`,
  `Detert, James R., and Ethan R. Burris. "Leadership Behavior and Employee Voice: Is the Door Really Open?" *Academy of Management Journal* 50, no. 4 (2007): 869–884.`,
  `Dirks, Kurt T., and Donald L. Ferrin. "Trust in Leadership: Meta-Analytic Findings and Implications for Research and Practice." *Journal of Applied Psychology* 87, no. 4 (2002): 611–628.`,
  `Edelman. "2024 Edelman Trust Barometer." Accessed 2024. https://www.edelman.com/trust/2024/trust-barometer.`,
  `Edmondson, Amy C. "Psychological Safety and Learning Behavior in Work Teams." *Administrative Science Quarterly* 44, no. 2 (1999): 350–383.`,
  `Fiorella, Leonardo, and Richard E. Mayer. *Learning as a Generative Activity: Eight Learning Strategies That Improve Achievement*. New York: Cambridge University Press, 2015.`,
  `Gallup. "Employee Engagement Meta-Analysis Brief." Accessed 2024. https://www.gallup.com/workplace/321032/employee-engagement-meta-analysis-brief.aspx.`,
  `Gallup. "Gallup Q12 Meta-Analysis Report." Accessed 2024. https://www.gallup.com/workplace/321725/gallup-q12-meta-analysis-report.aspx.`,
  `Gallup. "State of the Global Workplace 2024." Accessed 2024. https://www.gallup.com/workplace/349484/state-of-the-global-workplace.aspx.`,
  `Goldsmith, Marshall. "Goal Focus vs Mission Alignment." LinkedIn, August 2024. https://www.linkedin.com/posts/marshallgoldsmith_never-become-so-driven-to-achieve-your-goal-activity-7434655085621825537-lmPe.`,
  `Google. "Guide: Understand Team Effectiveness." *re:Work*. Accessed 2024. https://rework.withgoogle.com/guides/understanding-team-effectiveness/steps/introduction/.`,
  `Great Place to Work. "The High-Trust Workplace." Accessed 2024. https://www.greatplacetowork.com/resources/blog/what-is-a-high-trust-workplace.`,
  `Harter, James K., et al. "The Relationship Between Engagement at Work and Organizational Outcomes." *Gallup*, 2013. https://www.gallup.com/workplace/321032/employee-engagement-meta-analysis-brief.aspx.`,
  `Harter, James K., Frank L. Schmidt, and Theodore L. Hayes. "Business-Unit-Level Relationship Between Employee Satisfaction, Employee Engagement, and Business Outcomes: A Meta-Analysis." *Journal of Applied Psychology* 87, no. 2 (2002): 268–279.`,
  `Harvard Business Review. "Begin with Trust." *Harvard Business Review*, May 2022. https://hbr.org/2022/05/begin-with-trust.`,
  `Harvard Business Review. "The Balanced Scorecard: Measures that Drive Performance." *Harvard Business Review*, January 1992. https://hbr.org/1992/01/the-balanced-scorecard-measures-that-drive-performance.`,
  `Harvard Business Review. "The Leader's Guide to Corporate Culture." *Harvard Business Review*, January 2018. https://hbr.org/2018/01/the-leaders-guide-to-corporate-culture.`,
  `Harvard Business Review. "Why Leadership Training Fails, and What to Do About It." *Harvard Business Review*, October 2016. https://hbr.org/2016/10/why-leadership-training-fails-and-what-to-do-about-it.`,
  `Johns Hopkins University. "Principles of Community Engagement." 2nd ed. Accessed 2015. https://ictr.johnshopkins.edu/wp-content/uploads/2015/10/CTSAPrinciplesofCommunityEngagement.pdf.`,
  `Keijzer, Maarten A., Marco Mäs, and Andreas Flache. "Polarization on Social Media." *Journal of Artificial Societies and Social Simulation* 27, no. 1 (2024): 7. https://www.jasss.org/27/1/7.html.`,
  `Kim, Peter H., Kurt T. Dirks, Cecily D. Cooper, and Donald L. Ferrin. "Repairing Trust with Individuals vs. Groups." *Academy of Management Review* 31, no. 1 (2006): 87–104.`,
  `Kluger, Avraham N., and Angelo DeNisi. "The Effects of Feedback Interventions on Performance: A Historical Review, a Meta-Analysis, and a Preliminary Feedback Intervention Theory." *Psychological Bulletin* 119, no. 2 (1996): 254–284.`,
  `Lacerenza, Christina N., et al. "Leadership Training Design, Delivery, and Implementation: A Meta-Analysis." *Journal of Applied Psychology* 102, no. 12 (2017): 1686–1718.`,
  `Locke, Edwin A., and Gary P. Latham. "Building a Practically Useful Theory of Goal Setting and Task Motivation: A 35-Year Odyssey." *American Psychologist* 57, no. 9 (2002): 705–717.`,
  `Mathieu, John F., et al. "Team Effectiveness 1997–2007: A Review of Recent Advancements and a Glimpse into the Future." *Journal of Management* 34, no. 3 (2008): 410–476.`,
  `Mayer, Richard E. *The Cambridge Handbook of Multimedia Learning*. 2nd ed. Cambridge: Cambridge University Press, 2014.`,
  `Mayer, Roger C., James H. Davis, and F. David Schoorman. "An Integrative Model of Organizational Trust." *Academy of Management Review* 20, no. 3 (1995): 709–734.`,
  `McKinsey & Company. "The State of Organizations 2023." Accessed 2023. https://www.mckinsey.com/capabilities/people-and-organizational-performance/our-insights/the-state-of-organizations-2023.`,
  `McKinsey & Company. "The Workforce Purpose Index 2024." Accessed 2024. https://www.mckinsey.com/capabilities/people-and-organizational-performance/our-insights/the-workforce-purpose-index.`,
  `National Research Council. *How People Learn II: Learners, Contexts, and Cultures*. Washington, DC: The National Academies Press, 2018.`,
  `New York State Education Department. "Successful School Leadership: What It Is and How It Influences Pupil Learning." Accessed 2024. https://www.nysed.gov/sites/default/files/principal-project-file-55-successful-school-leadership-what-it-is-and-how-it-influences-pupil-learning.pdf.`,
  `Next Generation Science Standards. "Evidence Statements Front Matter." Accessed January 2015. https://www.nextgenscience.org/sites/ngss/files/Front%20Matter%20Evidence%20Statements%20PDF%20Jan%202015.pdf.`,
  `Prosci. "Connecting Change to Business Results With the 4 P's Exercise." Accessed 2024. https://www.prosci.com/blog/connecting-change-to-business-results-4-ps-exercise.`,
  `PwC. "Trust in U.S. Business Survey." Accessed 2024. https://www.pwc.com/us/en/services/consulting/business-transformation/library/trust-in-us-business-survey.html.`,
  `Rousseau, Denise M., et al. "Not So Different After All: A Cross-Discipline View of Trust." *Academy of Management Review* 23, no. 3 (1998): 393–404.`,
  `Ryan, Richard M., and Edward L. Deci. "Self-Determination Theory and the Facilitation of Intrinsic Motivation, Social Development, and Well-Being." *American Psychologist* 55, no. 1 (2000): 68–78.`,
  `Senge, Peter M. *The Fifth Discipline: The Art & Practice of The Learning Organization*. New York: Doubleday, 1990.`,
  `Society for Human Resource Management Foundation. "Employee Engagement and Commitment: A Guide to Understanding, Measuring, and Increasing Engagement in Your Organization." Accessed 2024. https://www.dmi-ida.org/download-pdf/pdf/Employee%20Engagement%20and%20Commitment%20A%20Guide%20to%20Understanding,%20Measuring,%20and%20Increasing%20Engagement%20in%20Your%20Organization.pdf.`,
  `Tufte, Edward R. *Visual Explanations: Images and Quantities, Evidence and Narrative*. Cheshire, CT: Graphics Press, 1997.`,
  `U.S. Centers for Disease Control and Prevention. "Program Evaluation Framework." *Morbidity and Mortality Weekly Report* 73, no. 6 (2024): 1–19. https://www.cdc.gov/mmwr/volumes/73/rr/rr7306a1.htm.`,
  `U.S. Department of Education. "Selecting Evidence-Based Practices for Tiers 1, 2, and 3." Accessed 2024. http://www.ed.gov/teaching-and-administration/lead-and-manage-my-school/state-support-network/ssn-resources/selecting-evidence-based-practices-for-tiers-1-2-and-3-navigating-clearinghouses-and-databases.`,
  `U.S. Preventive Services Task Force. "Procedure Manual Section 3: Topic Work Plan Development." Accessed 2024. https://www.uspreventiveservicestaskforce.org/uspstf/about-uspstf/methods-and-processes/procedure-manual/procedure-manual-section-3-topic-work-plan-development.`,
  `Ulrich, Dave. "Leadership Code 4.0: An Evidence-Based View of Effective Leadership." LinkedIn, August 2023. https://www.linkedin.com/posts/daveulrichpro_leadership-code-40-an-evidence-based-view-activity-7218977761707638784-NF9b.`,
  `World Economic Forum. "Future of Jobs Report 2025." Accessed 2025. https://reports.weforum.org/docs/WEF_Future_of_Jobs_Report_2025.pdf.`,
  `World Health Organization. "Burn-out: An Occupational Phenomenon." Accessed 2024. https://www.who.int/standards/classifications/frequently-asked-questions/burn-out-an-occupational-phenomenon.`,
  `Yukl, Gary. *Leadership in Organizations*. 8th ed. New York: Pearson, 2013.`,
  `Zak, Paul J. "The Neuroscience of Trust." *Harvard Business Review*, January 2017. https://hbr.org/2017/01/the-neuroscience-of-trust.`,
];

// ── Parse a citation string into docx TextRun / ExternalHyperlink children ──
// Handles: *italic*, URLs at end of string
function parseEntry(text) {
  const children = [];
  // Split on URLs (http/https at word boundary to end of token)
  const urlRegex = /(https?:\/\/\S+)/g;
  const parts = text.split(urlRegex);

  for (const part of parts) {
    if (!part) continue;
    if (/^https?:\/\//.test(part)) {
      // URL — render as blue hyperlink
      const url = part.replace(/\.$/, ""); // strip trailing period for actual URL
      const displayText = part; // keep trailing period in display if present
      children.push(
        new ExternalHyperlink({
          link: url,
          children: [new TextRun({
            text: displayText,
            font: "Times New Roman",
            size: 24, // 12pt
            color: "1155CC",
            underline: {},
          })],
        })
      );
    } else {
      // Regular text — parse *italic* spans
      const italicRegex = /\*([^*]+)\*/g;
      let last = 0;
      let m;
      while ((m = italicRegex.exec(part)) !== null) {
        if (m.index > last) {
          children.push(new TextRun({
            text: part.slice(last, m.index),
            font: "Times New Roman",
            size: 24,
          }));
        }
        children.push(new TextRun({
          text: m[1],
          font: "Times New Roman",
          size: 24,
          italics: true,
        }));
        last = m.index + m[0].length;
      }
      if (last < part.length) {
        children.push(new TextRun({
          text: part.slice(last),
          font: "Times New Roman",
          size: 24,
        }));
      }
    }
  }
  return children;
}

// ── Build paragraphs ─────────────────────────────────────────────────────────
const bibParagraphs = entries.map((entry) =>
  new Paragraph({
    children: parseEntry(entry),
    alignment: AlignmentType.LEFT,
    spacing: { after: 160, line: 360, lineRule: "auto" }, // ~1.5 line spacing, 8pt after
    indent: { left: 720, hanging: 720 }, // Chicago hanging indent: 0.5"
  })
);

// ── Document ─────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Times New Roman", size: 24 },
      },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: "Times New Roman", size: 28, bold: true, color: "000000" },
        paragraph: {
          spacing: { before: 0, after: 480 },
          outlineLevel: 0,
        },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1" margins
        },
      },
      children: [
        // Title
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "Bibliography", font: "Times New Roman", size: 28, bold: true })],
        }),
        // Sub-note
        new Paragraph({
          children: [new TextRun({
            text: "The Influence Engine — Chicago 17th Edition",
            font: "Times New Roman",
            size: 20,
            italics: true,
            color: "555555",
          })],
          spacing: { after: 480 },
        }),
        // Entries
        ...bibParagraphs,
      ],
    },
  ],
});

const outPath = "/Users/chris/Desktop/CODE/GHOSTWRITR/bibliography-the-influence-engine.docx";
Packer.toBuffer(doc).then((buffer) => {
  writeFileSync(outPath, buffer);
  console.log(`Written: ${outPath}`);
  console.log(`Entries: ${entries.length}`);
});
