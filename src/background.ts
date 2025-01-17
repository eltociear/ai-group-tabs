import { handleOneTab } from "./services";
import { getStorage } from "./utils";

let types: string[] = [];

chrome.storage.local.get("types", (result) => {
  if (result.types) {
    types = result.types;
  }
});

const tabMap = new Map<string, number>();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  chrome.storage.local.get("types", (result) => {
    if (result.types) {
      types = result.types;
    }
  });

  const result = message.result;

  types.forEach((_, i) => groupOneType(result[i].type, result[i].tabIds));
});

chrome.tabGroups.onUpdated.addListener((group) => {
  if (!group.title) return;
  const type = group.title;

  if (tabMap.has(type)) return;

  tabMap.set(type, group.id);
});

async function groupOneType(type: string, tabIds: number[]) {
  if (tabIds.length === 0) return;

  chrome.tabs.group({ tabIds }, async (groupId) => {
    await chrome.tabGroups.update(groupId, { title: type });
  });
}

async function createGroupWithTitle(tabId: number, title: string) {
  try {
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title });
    tabMap.set(title, groupId);
  } catch (error) {
    console.error("Error creating tab group:", error);
  }
}

async function handleNewTab(tab: chrome.tabs.Tab) {
  try {
    const isOn = await getStorage<boolean>("isOn");
    if (
      !isOn ||
      !tab.id ||
      !tab.url ||
      tab.url === "chrome://newtab/" ||
      !types.length
    ) {
      return;
    }

    const openAIKey = await getStorage<string>("openai_key");
    if (!openAIKey) return;

    const type = await handleOneTab(tab, types, openAIKey);
    const groupId = tabMap.get(type);

    if (typeof groupId === "undefined") {
      // Create a new group and add it to the map if it does not exist
      await createGroupWithTitle(tab.id, type);
    } else {
      // When groupId exists, just add the tab to the group
      await chrome.tabs.group({ tabIds: tab.id, groupId });
    }
  } catch (error) {
    console.error("Error in handleNewTab:", error);
  }
}

async function handleTabUpdate(tabId: any, changeInfo: any, tab: any) {
  const enable = await getStorage<boolean>("isOn");
  if (
    !enable ||
    changeInfo.status !== "complete" ||
    !tab.url ||
    tab.url === "chrome://newtab/"
  ) {
    return;
  }

  try {
    const openAIKey = await getStorage<string>("openai_key");
    if (!openAIKey) return;

    const type = await handleOneTab(tab, types, openAIKey);
    const groupId = tabMap.get(type);

    if (groupId === undefined) {
      // If no group exists, create a new one and add it to the map
      await createGroupWithTitle(tab.id, type);
    } else {
      // Move the tab into the existing group
      await chrome.tabs.group({ tabIds: tab.id, groupId });
    }
  } catch (error) {
    console.error("Error in handleTabUpdate:", error);
  }
}

chrome.tabs.onCreated.addListener(handleNewTab);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
