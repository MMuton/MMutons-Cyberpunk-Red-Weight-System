<p align="center">
  <img src = "https://i.imgur.com/t19wzfA.png" width=700>
</p>
<h1 align="center"> Cyberpunk RED: Weight System </h1> <br>
<p align="center">
  A weight system module for Cyberpunk RED, made by MMuton.
</p>
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Known Issues](#known-issues)
- [Disclaimer](#disclaimer)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Introduction

This module has been created to add some depth to looting and perhaps even to balance out player inventories. Inspired by the Pathfinder 2e system.

## Features

Note: The values given below can be changed in the settings.

* Max capacity is determined by a character's **BODY × 3**, or a custom absolute number of your choosing.
* Max capacity can be upgraded with cyberware.
* The capacity bar shows at the top of the Gear tab and is calculated automatically.
* Equipped weapons & armor weigh **1/3 of their original value**.
* Upgrades & ammo do not weigh anything when inserted into an item.
* Container system: Either use a multi-purpose bag like a carryall and reduce the weight of everything inside by 50%,
or use a specialized bag such as a MedTech Bag and reduce the weight of the stored drug items to 0.
* Containers get their own **Containers** section on the Gear tab (just above the Gear category), with each bag's contents listed under it (collapsible). This can be turned off per user with the **Group Items Under Their Container** setting, which keeps items in their normal categories with a container marker instead.
* Drag an item onto a container (or onto an item already inside it) to put it in; drag a stored item anywhere else on the Gear tab to take it out. Right-click still works too.
* While you drag an item, containers light up: **yellow** = can take it, **green** = you're hovering over one that can, **red** = wrong type, full, or not allowed.
* Containers can't be put inside other containers, and installed items (cyberware, attachments, programs) can't be stored.
* All weights are in **units**.

<h1 align="center"> Dynamic Tracking </h1>
<p align="center">
  <img src = "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExODZzaW55YnUzbjYzczlpbHB6b216N3dmOWkzc2lvaGpyZjB0eWZ6OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/UkcgtDacfcMjtp2JNz/giphy.gif" width=700>
</p>

<h1 align="center"> Equipping Reduces Item Weight </h1>
<p align="center">
  <img src = "https://media.giphy.com/media/QW1Fn1AeRXHyqNLsl0/giphy.gif" width=700>
</p>

<h1 align="center"> Container System </h1>
<p align="center">
  <img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHR5cTJwM2FrZ2ZxeXk3ZmxtOHQ4MzU4NGR1N3F5eXluMm95anZuMyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/eGaBHD9J8YILMW7jIS/giphy.gif" width=700>
</p>

<h1 align="center"> Compendium Cloner With Added Default Weights </h1>
<p align="center">
  <img src="https://i.imgur.com/xhbu9VV.png" width=700>
  
</p>
<h1 align="center"> Increase Maximum Capacity With Cyberware </h1>
<p align="center">
  <img src="https://i.imgur.com/G2803fX.png" width=700>
</p>

## Known Issues

* <s>The weight editing menu can stop rendering when editing a container type; you might have to re-open the container item during configuration. I am working on a fix.</s>

  Fixed. It now only needs to be re-rendered once when being transformed into a container.
* <s>Currently, you have to set the weight of every item manually. I am working on a system that automatically creates a clone of your compendium with pre-determined item weights.</s>

  Fixed. You can now clone compendiums in the module settings to have the item pre-weighed.

## Disclaimer

As someone who is very much new to programming, I have enlisted the help of AI during this project when I have struggled with the code.
