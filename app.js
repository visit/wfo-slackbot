#!/usr/bin/env node

const { App } = require('@slack/bolt');
const fs = require('fs');

const _dbPaths = {
  root: 'db/',
  config: 'db/config.json',
  status: 'db/status.json'
};

const _db = {
  config: {
    offices: {}
  },
  status: {
    dates: {}
  }
}
if (fs.existsSync(_dbPaths.config))
  _db.config = Object.assign(_db.config, JSON.parse(fs.readFileSync(_dbPaths.config)));
if (fs.existsSync(_dbPaths.status))
  _db.status = Object.assign(_db.status, JSON.parse(fs.readFileSync(_dbPaths.status)));

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

(async () => {
  await app.start(process.env.PORT || 3000);

  if (process.env.NODE_ENV == 'production') {
  } else {
  }

  console.log('wfo-slackbot is running!');
})();

const exitHandler = () => {
  if (!fs.existsSync(_dbPaths.root))
    fs.mkdirSync(_dbPaths.root);
  fs.writeFileSync(_dbPaths.config, JSON.stringify(_db.config, null, 2));
  fs.writeFileSync(_dbPaths.status, JSON.stringify(_db.status, null, 2));
  process.exit();
};
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);

app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    const result = await client.views.publish({
      user_id: event.user,
      view: getHomeView(event.user)
    });
  }
  catch (error) {
    logger.error(error);
  }
});

const getHomeView = (user) => {
  const view =
  {
    type: 'home',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Welcome to the WFO bot home, <@' + user + '> :house: :office:*'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Offices*'
        }
      },
      {
        type: 'divider'
      }
    ]
  };

  for (const [key, office] of Object.entries(_db.config.offices)) {
    view.blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: key
        },
        accessory: {
          type: 'image',
          image_url: office.imageUrl,
          alt_text: ''
        }
      });

    let date = new Date();
    for (let i = 0; i < 7; i++) {
      let dateKey = date.toISOString().substring(0, 10);
      if (dateKey in _db.status.dates) {
        let elements = [];

        let wfo = [], wfh = [];
        for (const [userKey, user] of Object.entries(_db.status.dates[dateKey].users)) {
          if (userKey in office.users) {
            if (user.status == 'wfo')
              wfo.push(userKey);
            else if (user.status == 'wfh')
              wfh.push(userKey);
          }
        }

        if (wfo.length > 0) {
          elements.push(
            {
              type: 'plain_text',
              text: ':office:'
            },
            {
              type: 'mrkdwn',
              text: wfo.map(x => `<@${x}>`).join('')
            });
        }

        if (wfh.length > 0) {
          elements.push(
            {
              type: 'plain_text',
              text: ':house:'
            },
            {
              type: 'mrkdwn',
              text: wfh.map(x => `<@${x}>`).join('')
            });
        }

        if (elements.length > 0) {
          view.blocks.push(
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${i == 0 ? 'Today' : i == 1 ? 'Tomorrow' : dateKey}*`
              }
            },
            {
              type: 'context',
              elements: elements
            });
        }
      }
      date.setDate(date.getDate() + 1);
    }

    if (user in office.users) {
      view.blocks.push(
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Leave office'
              },
              style: 'danger',
              action_id: 'leave_office',
              value: key
            }
          ]
        });
    }
    else {
      view.blocks.push(
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Join office'
              },
              style: 'primary',
              action_id: 'join_office',
              value: key
            }
          ]
        });
    }
  }

  view.blocks.push(
    {
      type: 'divider'
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Add office'
          },
          action_id: 'add_office'
        }
      ]
    });

  return view;
};

app.action('join_office', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    for (let office of Object.values(_db.config.offices)) {
      if (body.user.id in office.users)
        delete office.users[body.user.id];
    };

    let office = _db.config.offices[body.actions[0].value];
    office.users[body.user.id] = {
      name: body.user.name
    };
  }
  catch (error) {
    logger.error(error);
  }

  await client.views.update({
    view_id: body.view.id,
    view: getHomeView(body.user.id)
  });
});

app.action('leave_office', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    let office = _db.config.offices[body.actions[0].value];
    if (body.user.id in office.users)
      delete office.users[body.user.id];
  }
  catch (error) {
    logger.error(error);
  }

  await client.views.update({
    view_id: body.view.id,
    view: getHomeView(body.user.id)
  });
});

app.action('add_office', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: getAddOfficeView(body.view.id)
    });
  }
  catch (error) {
    logger.error(error);
  }
});

const getAddOfficeView = (view_id) => {
  const view =
  {
    type: 'modal',
    callback_id: 'add_office',
    private_metadata: view_id,
    title: {
      type: 'plain_text',
      text: 'Add office'
    },
    blocks: [
      {
        block_id: 'name',
        type: 'input',
        label: {
          type: 'plain_text',
          text: 'Name'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'name'
        }
      },
      {
        block_id: 'image',
        type: 'input',
        label: {
          type: 'plain_text',
          text: 'Image URL'
        },
        element: {
          type: 'url_text_input',
          action_id: 'image_url'
        }
      },
      {
        block_id: 'channel',
        type: 'input',
        label: {
          type: 'plain_text',
          text: 'Post attendance in channel'
        },
        element: {
          type: 'channels_select',
          action_id: 'channel'
        }
      }
    ],
    submit: {
      type: 'plain_text',
      text: 'Save'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    }
  };

  return view;
};

app.view('add_office', async ({ ack, body, view, client, logger }) => {
  await ack();

  try {
    _db.config.offices[view.state.values.name.name.value] = {
      imageUrl: view.state.values.image.image_url.value,
      channel: view.state.values.channel.channel.selected_channel,
      createdBy: {
        id: body.user.id,
        name: body.user.name
      },
      users: {}
    };

    await client.views.update({
      view_id: view.private_metadata,
      view: getHomeView(body.user.id)
    });
  }
  catch (error) {
    logger.error(error);
  }
});

app.shortcut('wfo', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: getStatusView('wfo')
    });
  }
  catch (error) {
    logger.error(error);
  }
});

app.shortcut('wfh', async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: getStatusView('wfh')
    });
  }
  catch (error) {
    logger.error(error);
  }
});

const getStatusView = (type) => {
  const view =
  {
    type: 'modal',
    callback_id: 'status',
    private_metadata: type,
    title: {
      type: 'plain_text',
      text: `Working from ${type == 'wfo' ? 'office' : 'home'}`
    },
    blocks: [
      {
        block_id: 'date',
        type: 'input',
        label: {
          type: 'plain_text',
          text: 'Date'
        },
        element: {
          type: 'datepicker',
          action_id: 'date'
        }
      }
    ],
    submit: {
      type: 'plain_text',
      text: 'Save'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    }
  };

  return view;
};

app.view('status', async ({ ack, body, view, client, logger }) => {
  await ack();

  try {
    const status = view.private_metadata;
    const date = view.state.values.date.date.selected_date;
    setStatus(date, body.user.id, status);

    /*await client.chat.postEphemeral({
      user: body.user.id,
      channel: body.channel_id, //TODO: the channel context is not available
      text: `Set your status to working from ${status == 'wfo' ? 'office' : 'home'} on ${date}`
    });*/
  }
  catch (error) {
    logger.error(error);
  }
});

app.command('/wfo', async ({ ack, body, client, respond, logger }) => {
  await ack();
  try {
    let date = parseDate(body.text);
    if (date) {
      setStatus(date, body.user_id, 'wfo');
      await respond(`Set your status to working from office on ${date}`);
    }
    else {
      const result = await client.views.open({
        trigger_id: body.trigger_id,
        view: getStatusView('wfo')
      });
    }
  }
  catch (error) {
    logger.error(error);
  }
});

app.command('/wfh', async ({ ack, body, client, respond, logger }) => {
  await ack();

  try {
    let date = parseDate(body.text);
    if (date) {
      setStatus(date, body.user_id, 'wfh');
      await respond(`Set your status to working from home on ${date}`);
    }
    else {
      const result = await client.views.open({
        trigger_id: body.trigger_id,
        view: getStatusView('wfh')
      });
    }
  }
  catch (error) {
    logger.error(error);
  }
});

const setStatus = (date, user, status) => {
  if (!(date in _db.status.dates))
    _db.status.dates[date] = {
      users: {}
    };

  _db.status.dates[date].users[user] = {
    status: status
  };
};

const parseDate = (text) => {
  if (text) {
    text = text.toLowerCase();
    let date = null;
    if (text == 'today') {
      date = new Date();
    } else if (text == 'tomorrow') {
      date = new Date();
      date.setDate(date.getDate() + 1);
    }
    if (date)
      return date.toISOString().substring(0, 10);
  }
  return null;
};
