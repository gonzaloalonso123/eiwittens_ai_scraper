import OpenAI from "openai";
import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs";
import axios from "axios";
import { JSDOM } from "jsdom"; // For cleaning HTML
import { configDotenv } from "dotenv";

//from .env
const openai = new OpenAI({
  apiKey: configDotenv().parsed.OPENAI_API_KEY,
});
const URL =
  "https://nl.myprotein.com/p/sports-nutrition/impact-whey-protein/10530943/?gclsrc=aw.ds&gclid=Cj0KCQiAo-yfBhD_ARIsANr56g7IX4CiPQnQOGK84fpJb74LtRPQX8ekwT6ou9dE3m1N_UjGeau0A0AaAvR_EALw_wcB&affil=mpppc_campaign%3D71700000105403364&variation=10530960"; // Change this to the actual URL

// Function to fetch HTML content
async function fetchHTML(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching HTML:", error);
    throw error;
  }
}

// Function to clean HTML (remove scripts, styles, etc.)
function cleanHTML(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove unnecessary elements
  const elementsToRemove = document.querySelectorAll(
    "script, style, iframe, img, svg, link, meta, noscript"
  );
  elementsToRemove.forEach((element) => element.remove());

  // Return cleaned HTML
  return document.body.innerHTML;
}

// Function to send cleaned HTML to OpenAI
async function sendToOpenAI(html) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this HTML and identify the product price. Return the price and it also how to select the element with selenium. Use the most reliable option for this case. Css selector, class, id, or xpath. Here is the HTML: ${html}`,
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "price_extraction_schema",
        schema: {
          type: "object",
          properties: {
            price: {
              description: "The extracted price as a string.",
              type: "string",
            },
            select_by: {
              description: "The selector type to use to select the element.",
              type: "string",
              enum: ["css", "class", "id", "xpath"],
            },
            selector: {
              description: "How to identify the element containing the price.",
              type: "string",
            },
          },
          required: ["price", "xpath"],
          additionalProperties: false,
        },
      },
    },
  });

  console.log("completion details", completion.usage);
  console.log("OpenAI Completion:", completion.choices[0].message.content);
  return JSON.parse(completion.choices[0].message.content);
}

// Function to find element by XPath
async function findElementBySelector(driver, select_by, selector) {
  try {
    console.log("Finding element by selector:", select_by, selector);
  
    const element = await driver.findElement(By[select_by](selector));
    const price = await element.getText();
    console.log("got price", price);
    return { element, price };
  } catch (error) {
    console.error("Error finding element by selector:", error);
    throw error;
  }
}

const scraperOptions = [
  "--disable-popups",
  //   "--headless",
  "--window-size=1920,1080",
  "--start-maximized",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--remote-debugging-port=9230",
  "--disable-search-engine-choice-screen",
];

async function main() {
  let options = new chrome.Options();
  options.addArguments(...scraperOptions);

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  try {
    // Fetch and clean HTML
    const html = await fetchHTML(URL);
    const cleanedHTML = cleanHTML(html);

    // Send cleaned HTML to OpenAI
    const aiResponse = await sendToOpenAI(cleanedHTML);

    // Extract price and XPath from AI response
    const { price, select_by, selector } = aiResponse;

    // Navigate to the URL
    await driver.get(URL);

    // Find the price element using XPath
    const { element, price: extractedPrice } = await findElementBySelector(
      driver,
      select_by,
      selector
    );

    console.log("Extracted Price:", extractedPrice);

    // Generate scraper actions
    const actions = [
      {
        type: "select",
        selector: selector,
        select_by: select_by,
      },
    ];

    console.log("Scraper Actions:", actions);
  } catch (error) {
    console.error("there was an error");
  } finally {
    await driver.quit();
  }
}

main();
