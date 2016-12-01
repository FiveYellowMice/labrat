require 'concurrent'
require 'active_support/core_ext/numeric/time'
require 'cgi'
require 'faraday'
require 'json'
require 'active_support/core_ext/string/inflections'
require 'time'
require 'rss'

class LabRat::NyaaCatFeed


  include LabRat::Util


  USER_AGENT =
    "LabRat (+https://github.com/FiveYellowMice/labrat/blob/master/lib/labrat/nyaa_cat_feed.rb) \n" +
    "Faraday/#{Gem.loaded_specs['faraday'].version} \n" +
    "Ruby/#{RUBY_VERSION}"

  POST_URL_FORMAT = 'https://bbs.nyaa.cat/d/%s'


  def initialize(bot)
    setup_instance_variables(bot)
    Concurrent::TimerTask.execute(
      execution_interval: @config.nyaa_cat_feed.interval || 30.minutes,
      run_now: true
    ) do
      begin
        run
      rescue => e
        log_error e
      end
    end
  end


  def run
    log_info { 'Running...' }

    response = Faraday.get do |req|
      req.url 'https://bbs.nyaa.cat/'
      req.headers['User-Agent'] = USER_AGENT
    end

    session_cookie = response['Set-Cookie'].match(/flarum_session=(.*?)(?:,|;| |$)/)[1]
    csrf_token = response['X-CSRF-Token']

    response = Faraday.post do |req|
      req.url 'https://bbs.nyaa.cat/login'
      req.headers['User-Agent'] = USER_AGENT
      req.headers['Content-Type'] = 'application/json; charset=UTF-8'
      req.headers['Cookie'] = "flarum_session=#{session_cookie}"
      req.headers['X-CSRF-Token'] = csrf_token
      req.body = JSON.generate(
        identification: 'LabRat',
        password: @config.nyaa_cat_feed.password
      )
    end

    login_token = response['Set-Cookie'].match(/flarum_remember=(.*?)(?:,|;| |$)/)[1]

    response = Faraday.get do |req|
      req.url 'https://bbs.nyaa.cat/api/discussions',
        'include' => %w[start_user start_post tags].map{|s| s.camelize(:lower) }.join(','),
        'filter[q]' => ' tag:minecraft',
        'sort' => '-start_time'.camelize(:lower)
      req.headers['User-Agent'] = USER_AGENT
      req.headers['Cookie'] = "flarum_remember=#{login_token}"
    end

    posts_data = JSON.parse(response.body)

    discussions = posts_data['data'].map do |discussion_data|
      id             = discussion_data['id']
      title          = discussion_data['attributes']['title']
      start_time_str = discussion_data['attributes']['start_time'.camelize(:lower)]
      author_id      = discussion_data['relationships']['start_user'.camelize(:lower)]['data']['id']
      tag_ids        = discussion_data['relationships']['tags']['data'].map{|t| t['id'] }
      content_id     = discussion_data['relationships']['start_post'.camelize(:lower)]['data']['id']

      start_time = Time.xmlschema(start_time_str)
      author = posts_data['included'].find{|d| d['type'] == 'users' && d['id'] == author_id }['attributes']['username']
      tags = tag_ids.map do |tag_id|
        posts_data['included'].find{|d| d['type'] == 'tags' && d['id'] == tag_id }['attributes']['name']
      end
      content = posts_data['included'].find{|d| d['type'] == 'posts' && d['id'] == content_id }['attributes']['content_html'.camelize(:lower)]

      Discussion.new(id, title, start_time, author, tags, content)
    end

    feed = RSS::Maker.make('rss2.0') do |maker|
      maker.channel.title       = 'NyaaBBS Minecraft Tag (Unofficial)'
      maker.channel.link        = 'https://bbs.nyaa.cat/t/minecraft?sort=newest'
      maker.channel.description = 'Recent Threads of NyaaBBS Minecraft Tag (Unofficial)'
      maker.channel.updated     = Time.now.to_s

      discussions.sort{|a, b| b.start_time - a.start_time }.each do |dsc|
        maker.items.new_item do |item|
          item.title   = dsc.title
          item.link    = dsc.url
          item.updated = dsc.start_time.to_s
          item.author  = dsc.author

          dsc.tags.each do |tag|
            item.categories.new_category do |category|
              category.content = tag
            end
          end

          item.description = dsc.content
        end
      end
    end

    File.write(File.expand_path('nyaa_cat_feed_minecraft_tag.xml', @options.data_dir), feed)

    log_info { 'Done.' }
  end


  Discussion = Struct.new(:id, :title, :start_time, :author, :tags, :content)

  class Discussion

    def url
      POST_URL_FORMAT % id
    end

  end


end
